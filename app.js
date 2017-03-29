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

var extract_commits_spend_time = function(commits){
    commits_minutes_spend = commits.map(function(commit){
        spend_time = commit.message.match(/\/spend\s([0-9]{0,}[h][0-9]{0,}[m]|[0-9]{0,}[hm])/)
        if (spend_time && spend_time[1]){
          hours = '0'
          minutes = '0'
          if(spend_time[1].indexOf('m') != -1 && spend_time[1].indexOf('h') != -1) {
            hour_split = spend_time[1].split('h')
            hours = hour_split[0]
            minutes = hour_split[1].split('m')[0]
          } else if (spend_time[1].indexOf('h') != -1) {
            hours = spend_time[1].split('h')[0]
          }else if(spend_time[1].indexOf('m') != -1){
            minutes = spend_time[1].split('m')[0]
          }
          
          return parseInt(hours) * 60 + parseInt(minutes)
        }
    })
        
    minutes_added = commits_minutes_spend.reduce(function(acc, curr){
        return curr + acc
    }, 0)
    
    hours = Math.floor(minutes_added / 60)
    minutes = Math.floor(minutes_added % 60)
    return util.format('%dh%dm', hours, minutes)
}

var parse_data_from_issue_req = function(issue_data, issue_time_entries){
  return {
    author: issue_data.author.username,
    created_at: new Date(issue_data.created_at).toDateString(),
    labels: issue_data.labels,
    business_req: issue_data.description.match(/\# Business Requirement\s+(.*)/i)[1],
    time_spent: issue_time_entries.human_total_time_spent,
    time_estimate: issue_time_entries.human_time_estimate,
    milestone: issue_data.milestone
  }
}

var parse_data_from_wh_req = function(data){
  return {
    object_kind: data.object_kind,
    mr_author_username: data.user.username,
    date: data.object_attributes.created_at,
    proj_id: data.object_attributes.target_project_id || null,
    issue_nb: data.object_attributes.description.match("((?:[Cc]los(?:e[sd]?|ing)|[Ff]ix(?:e[sd]|ing)?|[Rr]esolv(?:e[sd]?|ing))(:?) +(?:(?:issues? +)?#(\\d+)(?:(?:, *| +and +)?)|([A-Z][A-Z0-9_]+-\\d+))+)") || null,
    id: data.object_attributes.id,
    iid: data.object_attributes.iid
  }
}

var make_row = function(issue_data, wh_data){
  return [
    [
      wh_data.issue_nb[3],
      wh_data.mr_author_username,
      issue_data.business_req,
      issue_data.labels.join(', '),
      issue_data.milestone && issue_data.milestone.title || '',
      issue_data.time_spent + '/' + (issue_data.time_estimate || "No Estimate"),
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
  if ( parsed_post.object_kind == "merge_request" /*&& parsed_post.object_attributes.state == "merged"*/){
    console.log("INFO: Got merge request")
    async.waterfall([
      function( callback ){
        db.get(
          'SELECT * FROM projects WHERE project_id = "'+parsed_post.object_attributes.source_project_id+'"', 
          function(err, row){
            if (row && row.access_token){
              ACCESS_TOKEN = row.access_token 
              console.log("INFO: Got access token")
              callback( null )
            }else{
              console.log('Error: Couldn\'t get access token')   
            }
          })
      },
      function( callback ) {
        var wh_data = parse_data_from_wh_req( parsed_post )
        if ( wh_data.proj_id && wh_data.issue_nb ){
          request(
            make_api_req (
              "GET",
              util.format(
                "/projects/%d/issues/%d",
                wh_data.proj_id,  
                wh_data.issue_nb[3] ),
              {} )
            , function( error, response, body ) {
                
                callback( null, JSON.parse(body), wh_data )
            } )
        }else{
          console.log('Error: Merge request doesn\'t have fixed issue in description')
        }
      },
      function ( issue_data, wh_data, callback ){
          request(
            make_api_req (
                "GET",
                util.format(
                    "/projects/%d/issues/%d/time_stats",
                    wh_data.proj_id,  
                    wh_data.issue_nb[3] ),
                {} ),
            function(error, response, body){
                console.log('INFO: Got issue\'s time stats')
                callback( null, issue_data, JSON.parse(body), wh_data )
          } )
      },
      function ( issue_data, time_stats, wh_data, callback ){
          if(time_stats.human_total_time_spent){
              callback( null, issue_data, time_stats.human_total_time_spent, wh_data, true )
          }else{
            request(
                make_api_req (
                    "GET",
                    util.format(
                    "/projects/%d/merge_requests/%d/commits",
                    wh_data.proj_id,  
                    wh_data.iid ),
                {} ),
                function(error, response, body){
                    commits = JSON.parse(body)
                    human_spend_times = extract_commits_spend_time(commits)
                    callback( null, issue_data, null, wh_data, false )
            } )
          }
      },
      function( issue_data, time_stats, wh_data, issue_spend_time_exists, callback ){
          if(issue_spend_time_exists){
              callback( null, issue_data, time_stats, wh_data )
          }else{
              request(make_api_req(
                  "POST",
                  util.format(
                      "/projects/%d/issues/%d/notes",
                      wh_data.proj_id,
                      issue_data.id
                  ), {
                      body: "body=%2Fspend+"+time_stats.human_total_time_spent
                  } ), function(error, response, body){
                    console.log('INFO: Added spend time from commits to issue')
                    callback( null, issue_data, time_stats, wh_data )
              } ) 
          }
      },
      function( issue_data, time_stats, wh_data, callback ){
        if(time_stats){
            callback( null, issue_data, time_stats, wh_data )
        }else{
          request(
            make_api_req (
                "GET",
                util.format(
                    "/projects/%d/issues/%d/time_stats",
                    wh_data.proj_id,  
                    wh_data.issue_nb[3] ),
                {} ),
            function(error, response, body){
                console.log('INFO: Got issue\'s time stats')
                callback( null, issue_data, JSON.parse(body), wh_data )
          } )
        }
      },
      function( issue_data, time_stats, wh_data, callback ){
        google_auth(function(auth){
          console.log('INFO: Got google auth')
          callback (
              null,
              parse_data_from_issue_req(issue_data, time_stats),
              wh_data,
              auth ) } )
      },
      function(issue_data, wh_data, auth ){
        var sheets = google.sheets('v4')
        var values = make_row(issue_data, wh_data)
        var request =  {
          auth: auth,
          spreadsheetId: SPREADSHEET_ID,
          range: 'Sheet1!A1:C',
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          resource: {
            values: values
          }
        }
        console.log('INFO: Adding row to spreadsheet')
        console.log(values)
        sheets.spreadsheets.values.append(request)
      }
    ])
  }else if(parsed_post.object_kind == "issue"){
    if(["reopened", "opened"].indexOf(parsed_post.object_attributes.state) != -1){
      console.log("INFO: Got opened issue")
      var business_req_matches = parsed_post.object_attributes.description.match(/\# Business Requirement\s+(.*)/i)
      if(business_req_matches && business_req_matches[1]){
        console.log('INFO: Issue got business requirement')
      }else{
        console.log('INFO: Issue got NO business requirement')
        async.waterfall([
          function( callback ){
            db.get(
              'SELECT * FROM projects WHERE project_id = "'+parsed_post.object_attributes.project_id+'"', 
              function(err, row){
                ACCESS_TOKEN = row.access_token
                console.log("INFO: Got access token")
                callback( null )
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
                  console.log("INFO: Closed issue")
                  request(make_api_req(
                    "POST",
                    util.format(
                      "/projects/%d/issues/%d/notes",
                      parsed_post.object_attributes.project_id,
                      parsed_post.object_attributes.id
                  ), {
                    body: "body=Business Requirement Missing, please use the tively issue template"
                  } ), function(error, response, body){
                      console.log('INFO: Comment error on issue page')
                  } )
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
