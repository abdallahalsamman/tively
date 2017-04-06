var express = require('express')
var app = express()
var request = require('request')
var util = require('util')
var async = require('async')
var fs = require('fs')
var google = require('googleapis');
var google_auth = require('./quickstart')
var sqlite3 = require('sqlite3').verbose()
var db = new sqlite3.Database('db.sqlite3')
db.run('CREATE TABLE IF NOT EXISTS projects (project_id TEXT, spreadsheet_id TEXT, access_token TEXT)')

var gitlab_webhook = require('./gitlab-webhook')

const GITLAB_CI_YML_CONTENT = fs.readFileSync('demo_code/gitlab-pipeline/gitlab-ci.yml').toString('base64')
const TIVLY_ISSUE_TEMPLATE_CONTENT = fs.readFileSync('demo_code/issue_templates/tivly.md').toString('base64')

const REDIRECT_URL = "http://tivly.lobolabshq.com/oauth-gitlab"
const CLIENT_SECRET = "5a9a70eba6ac81e7896941621fad48b676e86004e8ae668f9a342bf05e6309e4"
const CLIENT_ID = "fe638f1d649943378c0e76a7db3a2bd7ee818abc8db4fca58e81fd26b78ea0d7"
const WEBHOOK_URL = "http://tivly.lobolabshq.com/"

var make_api_set_status_req = function(owner, repo_name, commit_sha, data){
  return {
    method: "POST",
    url: "https://api.github.com" + util.format("/repos/%s/%s/statuses/%s", owner, repo_name, commit_sha),
    headers: {
        'Authorization': "token " + GITHUB_TOKEN,
        'User-Agent': 'Tivly 1.0 Beta'
    },
    body: data,
    json: true
  }
}

var make_api_get_req = function(url, token){
  return {
    method: "GET",
    url: url,
    headers: {
        'Authorization': "Bearer " + token,
        'User-Agent': 'Tivly 1.0 Beta'
    },
  }
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

var main = function(url, req, res){
  if (url == '/oauth-gitlab'){
    params = req.query
    data = util.format("client_id=%s&client_secret=%s&code=%s&grant_type=authorization_code&redirect_uri=%s", CLIENT_ID, CLIENT_SECRET, params.code, REDIRECT_URL)
    console.log('INFO: got request containing code to get access_token')
    async.waterfall([
      function ( callback ){
        request({
        	method: 'POST',
        	url: 'https://gitlab.com/oauth/token',
    	    body: data
        }, function(error, response, body){
            if(error){
              console.log('ERROR: couldn\'t get access_token')
            }else{
              body = JSON.parse(body)
              callback( null, body )
        } } )
      },
      function ( auth_info ) {
        request(
          make_api_get_req('https://gitlab.com/api/v4/projects?owned=true', auth_info["access_token"]),
          function(err, resp, projs_body){
            if(err){
              console.log('ERROR: can\'t get projects owned by user')
            }else{
              projs_body = JSON.parse(projs_body)
              console.log('INFO: got projects owned by user... rendering')
              res.render('choose-project', {token: auth_info["access_token"], projs_body: projs_body})
        } } )
      }
    ])
  }else if(url == '/hook-project'){
    params = req.query
    proj_obj = JSON.parse(params.proj_info)
    console.log('INFO: got request to hook project')
    async.waterfall([
      function ( callback ) {
        request({
            method: "PUT",
            url: "https://gitlab.com/api/v4/projects/"+proj_obj.id,
            headers: {
              'Authorization': "Bearer " + params.access_token,
              'User-Agent': 'Tivly 1.0 Beta'
            },
            body: {only_allow_merge_if_pipeline_succeeds: true},
            json: true
        }, function(error, response, body){
            if (error){
                console.log('ERROR: can\'t update project settings to not merge unless pipelines succeed')
            }else{
                console.log('INFO: changed project settings to not merge unless pipelines succeed')
                callback()
          } } )
      },
      function ( callback ) {
        request({
            method: "POST",
            headers: {
              'Authorization': "Bearer " + params.access_token,
              'User-Agent': 'Tivly 1.0 Beta'
            },
            url: util.format(
                "https://gitlab.com/api/v4/projects/%d/hooks?url=%s&merge_requests_events=true&issues_events=true&push_events=false&enable_ssl_verification=false",
                proj_obj.id,
                WEBHOOK_URL
        ) }, function(err, resp, add_hook_body){
            if (err){
                console.log("ERROR: couldn't add tively webhook to project")
            }else{
                console.log("INFO: added tively webhook to project")
                callback()
        } } )
      },
      function ( callback ) {
        request({
            method: "POST",
            headers: {
                'Authorization': "Bearer " + params.access_token,
                'User-Agent': 'Tivly 1.0 Beta'
            },
            url: "https://gitlab.com/api/v4/projects/" + 
              proj_obj.id + 
              "/repository/files/.gitlab%2Fissue_templates%2FTivly.md?branch=master&content=" + 
              TIVLY_ISSUE_TEMPLATE_CONTENT + 
              "&commit_message=Setup%20Tivly%20Issue%20Templates&encoding=base64"
        }, function(error, response, body){
            console.log("SUCCESS: created .gitlab/issue_templates/Tivly.md issue template")
            callback()
        } )
      },
      function ( callback ) {
        request({
            method: "POST",
            headers: {
                'Authorization': "Bearer " + params.access_token,
                'User-Agent': 'Tivly 1.0 Beta'
            },
            url: "https://gitlab.com/api/v4/projects/" + 
              proj_obj.id + 
              "/repository/files/.tivly%2Fhooks%2Finit-hooks?branch=master&content=" + 
              fs.readFileSync('demo_code/hooks/init-hooks').toString('base64') + 
              "&commit_message=Add%20Tivly%20Developer%20Githooks%20Setup%20Script&encoding=base64"
        }, function(error, response, body){
            console.log("SUCCESS: created .tivly/hooks/init-hooks hooks setup script")
            callback()
        } )
      },
      function ( callback ) {
        request({
            method: "POST",
            headers: {
                'Authorization': "Bearer " + params.access_token,
                'User-Agent': 'Tivly 1.0 Beta'
            },
            url: "https://gitlab.com/api/v4/projects/" + 
              proj_obj.id + 
              "/repository/files/.tivly%2Fhooks%2Fhooks-wrapper?branch=master&content=" + 
              fs.readFileSync('demo_code/hooks/hooks-wrapper').toString('base64') + 
              "&commit_message=Add%20Tivly%20Developer%20Githooks%20Wrapper&encoding=base64"
        }, function(error, response, body){
            console.log("SUCCESS: created .tivly/hooks/hooks-wrapper script")
            callback()
        } )
      },
      function ( callback ) {
        request({
            method: "POST",
            headers: {
                'Authorization': "Bearer " + params.access_token,
                'User-Agent': 'Tivly 1.0 Beta'
            },
            url: "https://gitlab.com/api/v4/projects/" + 
              proj_obj.id+"/repository/files/.tivly%2Fhooks%2Fcommit-msg?branch=master&content=" + 
              fs.readFileSync('demo_code/hooks/commit-msg').toString('base64') + 
              "&commit_message=Add%20Tivly%20CommitMsg%20Githook&encoding=base64"
        }, function(error, response, body){
            console.log("SUCCESS: created .tivly/hooks/commit-msg githook")
            callback()
        } )
      },
      function ( callback ) {
        request({
            method: "POST",
            headers: {
              'Authorization': "Bearer " + params.access_token,
              'User-Agent': 'Tivly 1.0 Beta'
            },
            url: "https://gitlab.com/api/v4/projects/"+proj_obj.id+"/repository/files/.gitlab-ci.yml?branch=master&content="+ GITLAB_CI_YML_CONTENT +"&commit_message=Setup%20Tivly%20%2Fspend%201m&encoding=base64"
        }, function(err, resp, add_hook_body){
            if (err){
                console.log("ERROR: couldn't create .gitlab-ci.yml pipeline config")
            }else{
                console.log("SUCCESS: created .gitlab-ci.yml pipeline config file")
                callback()
            }
        })
      },
      function( callback ){
        db.get('SELECT * FROM projects where project_id = "'+proj_obj.id+'"', function(err, row){
	  if ( row ){
	    res.send('Bookmark this: <a href="https://docs.google.com/spreadsheets/d/' + row.spreadsheet_id + '" >Spreadsheet</a>')
	  }else{
            google_auth(function(auth){
              console.log('INFO: Got google auth')
              callback ( null, auth ) } )
	  }
	})
      },
      function( auth, callback ){
        var sheets = google.sheets('v4')
        var request = {
          resource: {
            properties: {
              title: proj_obj.name
            }
          },
          auth: auth
        };

        sheets.spreadsheets.create(request, function(err, response) {
          if (err) {
            console.log(err);
            return;
          }
          callback( null, response, auth )
        });
      },
      function ( response, auth, callback ) {
          var drive = google.drive({
            version: 'v3',
            auth: auth
          });
          drive.permissions.create({
            fileId: response.spreadsheetId,
            resource: {
              role: 'writer',
              type: 'anyone'
            }
          }, function(err, resp) {
            drive.permissions.update({
              fileId: response.spreadsheetId,
              permissionId: resp.id,
            }, function(err , resp){
              callback( null, response )
            })
          })
      },
      function ( spreadsheet_obj ) {
        db.run('INSERT INTO projects VALUES ("'+proj_obj.id+'", "'+ spreadsheet_obj.spreadsheetId +'","'+params.access_token+'")')
        res.send('Bookmark this: <a href="'+spreadsheet_obj.spreadsheetUrl+'" >Spreadsheet</a>')
      }
    ])
  }
}

app.get('/oauth-gitlab', function(req, res) {
  main('/oauth-gitlab', req, res)
})

app.get('/hook-project', function(req, res){
  main('/hook-project', req, res)
})

app.get('/start_now', function(req, res) {
  res.render('start')
})

app.post('/', function(req, res) {
  execute_on_full_recieve(req, gitlab_webhook)
  res.send('ok')
})

app.set('view engine', 'pug')
app.set('views', 'views')
app.use(express.static('static'))
app.listen(3000)
