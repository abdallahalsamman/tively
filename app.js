var util = require('util')
var express = require('express')
var app = express()
var http = require('http')
var request = require('request')
var async = require('async')
var google = require('googleapis');
var google_auth = require('./quickstart')
var sqlite3 = require('sqlite3').verbose()
var db = new sqlite3.Database('db.sqlite3')

const HOST = "https://gitlab.com"
const SPREADSHEET_ID = "1CYdoGIl6aBTsJIuFiF2dzD_nx-GXzsxuUr-yFxlBqrA"
var ACCESS_TOKEN;

var make_api_req = function(method, url, acc){
  acc["method"] = method
  acc["url"] = HOST+"/api/v4"+url
  acc["headers"] = { 'Authorization': 'Bearer '+ACCESS_TOKEN }
  return acc
}

var parse_data_from_issue_req = function(data){
  return {
    author: data.author.username,
    created_at: data.created_at,
    labels: data.labels,
    business_req: data.description.match(/\# Business Requirement\s+(.*)/i)[1],
    milestone: data.milestone
  }
}

var parse_data_from_wh_req = function(data){
  return {
    object_kind: data.object_kind,
    mr_author_username: data.user.username,
    date: data.object_attributes.created_at,
    time_spent: data.object_attributes.time_logs,
    proj_id: data.object_attributes.target_project_id || null,
    issue_nb: data.object_attributes.description.match("((?:[Cc]los(?:e[sd]?|ing)|[Ff]ix(?:e[sd]|ing)?|[Rr]esolv(?:e[sd]?|ing))(:?) +(?:(?:issues? +)?#(\\d+)(?:(?:, *| +and +)?)|([A-Z][A-Z0-9_]+-\\d+))+)") || null,
    mr_nb: data.object_attributes.id
  }
}

var make_row = function(issue_data, wh_data){
  return [
    [
      wh_data.issue_nb[3],
      wh_data.mr_author_username,
      issue_data.business_req,
      issue_data.labels.join(', '),
      issue_data.milestone.title,
      wh_data.time_spent.reduce(function(acc, log){
        return acc + log.time_spent / 60
      }, 0) + "min",
      issue_data.created_at,
    ]
  ]
}

var execute_on_full_recieve = function(stream, callback){
  var body = ''
  stream.on('data', function(data) {
    body += data
  })
  stream.on('end', function(data) {
    callback(body)
  })
}

var main = function( post ) {
  parsed_post = JSON.parse( post )
  if ( parsed_post.object_kind == "merge_request" ){
    async.waterfall([
      function( callback ){
        db.get(
          'SELECT * FROM projects WHERE project_id = "'+parsed_post.object_attributes.source_project_id+'"', 
          function(err, row){
            ACCESS_TOKEN = row.access_token 
            callback( null )
          })
      },
      function( callback ) {
        var wh_data = parse_data_from_wh_req( parsed_post )
        console.log("got "+wh_data.object_kind)
        if ( wh_data.object_kind == "merge_request" && wh_data.proj_id && wh_data.issue_nb ){
          request(
            make_api_req (
              "GET",
              util.format(
                "/projects/%d/issues/%d",
                wh_data.proj_id,  
                wh_data.issue_nb[3] )
            )
            , function( eroor, response, body ) {
              callback( null, body, wh_data )
            } )
        }else{
          console.log('invalid webhook request')
        }
      },
      function( body, wh_data, callback ){
        issue_data = parse_data_from_issue_req ( JSON.parse( body ) )
        google_auth(function(auth){
          callback(null, issue_data, wh_data, auth)
        })
      },
      function(issue_data, wh_data, auth ){
        var sheets = google.sheets('v4');
        var request =  {
          auth: auth,
          spreadsheetId: SPREADSHEET_ID,
          range: 'Sheet1!A1:C',
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          resource: {
            values: make_row(issue_data, wh_data)
          }
        }
        sheets.spreadsheets.values.append(request)

      }
    ])
  }else if(parsed_post.object_kind == "issue"){
    if(["reopened", "opened"].indexOf(parsed_post.object_attributes.state) != -1){
      var business_req_matches = parsed_post.object_attributes.description.match(/\# Business Requirement\s+(.*)/i)
      if(business_req_matches && business_req_matches[1]){
        // PASS
      }else{
        // CLOSE ISSUE AND COMMENT WITH SUITABLE MESSAGE
        async.waterfall([
          function( callback ){
            db.get(
              'SELECT * FROM projects WHERE project_id = "'+parsed_post.object_attributes.project_id+'"', 
              function(err, row){
                ACCESS_TOKEN = row.access_token 
                callback()
              })
          },
          function( callback ){
            request(
              make_api_req(
                "PUT",
                util.format(
                  "/projects/%d/issues/%d?state_event=close",
                  parsed_post.object_attributes.project_id,
                  parsed_post.object_attributes.iid
            ), {}), function(error, response, body){
                  request(make_api_req(
                    "POST",
                    util.format(
                      "/projects/%d/issues/%d/notes",
                      parsed_post.object_attributes.project_id,
                      parsed_post.object_attributes.id
                  ), {
                    body: "body=Business Requirement Missing, please use the tively issue template"
                  } ) )
              } )
          }
        ])
      }
    }
  }
}

app.post('/', function(req, res) {
  execute_on_full_recieve(req, main)
  res.send('ok')
})

app.listen(3001)
