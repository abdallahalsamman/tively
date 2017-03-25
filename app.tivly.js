var express = require('express')
var app = express()
var request = require('request')
var util = require('util')
var fs = require('fs')
var sqlite3 = require('sqlite3').verbose()
var db = new sqlite3.Database('db.sqlite3')
db.run('CREATE TABLE IF NOT EXISTS projects (project_id TEXT, access_token TEXT)')

const GITLAB_CI_YML_CONTENT = fs.readFileSync('demo_code/gitlab-pipeline/gitlab-ci.yml').toString('base64')
const REDIRECT_URL = "http://bahama-agenda-3000.codio.io/oauth-gitlab"
const CLIENT_SECRET = "b713ec666614a6f06ae2c15d06117cf8d76a33398fa9108e69653665b7f5845b"
const CLIENT_ID = "6b7979bc2dbd78444592e30d624aa37cc0fc2c9145f3af44f1f70f5c4adbf21d"

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
    request({
    	method: 'POST',
    	url: 'https://gitlab.com/oauth/token',
	    body: data 
    }, function(error, response, body){
        if(error){
          console.log('ERROR: couldn\'t get access_token')
        }else{
          body = JSON.parse(body)
          request(
            make_api_get_req('https://gitlab.com/api/v4/projects?owned=true', body["access_token"]),
            function(err, resp, projs_body){
              if(err){
                console.log('ERROR: can\'t get projects owned by user')
              }else{
                projs_body = JSON.parse(projs_body)
                console.log('INFO: got projects owned by user... rendering')
                res.render('choose-project', {token: body["access_token"], projs_body: projs_body})
              }
            }
          )
        }
    })
  }else if(url == '/hook-project'){
    params = req.query
    console.log('INFO: got request to hook project')
    db.run('INSERT INTO projects VALUES ("'+params.proj_id+'", "'+params.access_token+'")')
    request({
        method: "PUT",
        url: "https://gitlab.com/api/v4/projects/"+params.proj_id,
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
            
            request({
                method: "POST",
                headers: {
                  'Authorization': "Bearer " + params.access_token,
                  'User-Agent': 'Tivly 1.0 Beta'
                },
                url: "https://gitlab.com/api/v4/projects/"+params.proj_id+"/hooks?url=http://bahama-agenda-3001.codio.io/&merge_requests_events=true&enable_ssl_verification=false"
            }, function(err, resp, add_hook_body){
                debugger
                if (err){
                    console.log("ERROR: couldn't add tively webhook to project")
                }else{
                    console.log("INFO: added tively webhook to project")
                }
            })
            
            request({
                method: "POST",
                headers: {
                  'Authorization': "Bearer " + params.access_token,
                  'User-Agent': 'Tivly 1.0 Beta'
                },
                url: "https://gitlab.com/api/v4/projects/"+params.proj_id+"/repository/files/.gitlab-ci.yml?branch=master&content="+ GITLAB_CI_YML_CONTENT +"&commit_message=Setup%20Tivly&encoding=base64"
            }, function(err, resp, add_hook_body){
                if (err){
                    console.log("ERROR: couldn't create .gitlab-ci.yml pipeline config")
                }else{
                    console.log("SUCCESS: created .gitlab-ci.yml pipeline config file")
                    res.send('SUCCESS')
                }
            })
        }
    })
  }
}

app.get('/oauth-gitlab', function(req, res) {
  main('/oauth-gitlab', req, res)
})

app.get('/hook-project', function(req, res){
  main('/hook-project', req, res)
})

app.set('view engine', 'pug')
app.set('views', 'views')
app.use(express.static('static'))
app.listen(3000)
