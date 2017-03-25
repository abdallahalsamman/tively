var util = require('util')
var express = require('express')
var app = express()
var http = require('http')
var async = require('async')
var google = require('googleapis');
var google_auth = require('./quickstart')
var sqlite3 = require('sqlite3').verbose()
var db = new sqlite3.Database('db.sqlite3')

const HOST = "gitlab.com"
const SPREADSHEET_ID = "1CYdoGIl6aBTsJIuFiF2dzD_nx-GXzsxuUr-yFxlBqrA"
var PRIVATE_TOKEN;

var make_api_get_issue_req = function(proj_id, issue_id){
  return {
    host: HOST,
    path: util.format("/api/v4/projects/%d/issues/%d", proj_id, issue_id),
    headers: {'PRIVATE-TOKEN': PRIVATE_TOKEN}
  }
}

var parse_data_from_issue_req = function(data){
  return {
    author: data.author.username,
    created_at: data.created_at,
    description: data.description,
    labels: data.labels,
    business_req: data.description,
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
      issue_data.description,
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
            PRIVATE_TOKEN = row.access_token 
            callback( null )
          })
      },
      function( callback ) {
        var wh_data = parse_data_from_wh_req( parsed_post )
        console.log("got "+wh_data.object_kind)
        if ( wh_data.object_kind == "merge_request" && wh_data.proj_id && wh_data.issue_nb ){
          http.get(
            make_api_get_issue_req ( wh_data.proj_id, wh_data.issue_nb[3] )
            , function( res ) {
              execute_on_full_recieve (
                res
                , function( data ){
                  callback( null, data, wh_data ) } ) } )
        }else{
          console.log('invalid webhook request')
        }
      },
      function( data, wh_data, callback ){
        issue_data = parse_data_from_issue_req ( JSON.parse( data ) )
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
  } else if ( parsed_post.object_kind == "spreadsheet_change" ){
    async.waterfall([
      function ( callback ){
        // TODO
        debugger
      }
    ])
  }
}

app.post('/', function(req, res) {
  execute_on_full_recieve(req, main)
  res.send('ok')
})

app.listen(3001)
