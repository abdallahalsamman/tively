var express = require('express')
var app = express()
var request = require('request')
var curlify = require('request-as-curl')
var util = require('util')
var async = require('async')

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

var make_api_get_req = function(url){
  return {
    method: "GET",
    url: url,
    headers: {
        'Authorization': "token " + GITHUB_TOKEN,
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
//     data = util.format("client_id=%s&client_secret=%s&code=%s&grant_type=authorization_code&redirect_uri=%s", CLIENT_ID, CLIENT_SECRET, params.code, REDIRECT_URL)
    data = "client_id=6b7979bc2dbd78444592e30d624aa37cc0fc2c9145f3af44f1f70f5c4adbf21d&client_secret=b713ec666614a6f06ae2c15d06117cf8d76a33398fa9108e69653665b7f5845b&code="+params.code+"&grant_type=authorization_code&redirect_uri=http://bahama-agenda-3000.codio.io/oauth-gitlab"
    request({
    	method: 'POST',
	url: 'https://gitlab.com/oauth/token',
        headers: {'User-Agent': 'Tively'},
	data: data 
    }, function(error, response, body){
      res.send( data + body )
    })
  }
}

app.get('/oauth-gitlab', function(req, res) {
  main('/oauth-gitlab', req, res)
})
app.listen(3000)
