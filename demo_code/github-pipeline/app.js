var express = require('express')
var app = express()
var request = require('request');
var util = require('util')
var async = require('async')

const GITHUB_TOKEN = "bc1a62decaf348b502f0df0e60122ee6f107c297" 

var make_commits = function(commits){
    return commits.map(function(commit){
        return [commit["sha"], commit["commit"]["message"]]
    })
}

var validate_commits = function(commits){
    all_healthy = true
    success = []
    failure = []
    commits.forEach(function (commit){
      matches = commit[1].match(/\/spend\s([0-9]{0,2}[h][0-9]{0,2}[m]|[0-9]{0,2}[hm])/g)
      if (matches){
          success.push( commit )
      }else{
          all_healthy = false
          failure.push( commit )
      }      
    })
    return [all_healthy, success, failure]
}

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

var main = function(data){
  json_data = JSON.parse(data)
  commits = []
  
  async.waterfall([
      function( callback ){
          if(json_data["commits"]){
             ref = json_data["ref"].split("refs/heads/")[1]
             base_ref = json_data["base_ref"] ? json_data["base_ref"].split("refs/heads/")[1] : "master"
             request(make_api_get_req("https://api.github.com/repos/abdullah-s/ci-test/compare/"+base_ref+"..."+ref), function(error, reponse, body){
                  compare_data = JSON.parse(body)
                  commits = make_commits( compare_data["commits"] )
                  callback( null, validate_commits( commits ), commits[commits.length-1][0] )
              })
          }else if(json_data["pull_request"]){
              request(make_api_get_req(json_data["pull_request"]["commits_url"]), function(error, reponse, body){
                  commits = make_commits(JSON.parse(body))
                  callback( null, validate_commits(commits), commits[commits.length-1][0] )
              })
          }
      }, function ( commits, last_commit ){
          if (commits){
            repo_owner = json_data["repository"]["owner"]["login"]
            repo_name = json_data["repository"]["name"]
            commits[1].forEach(function(commit){
                if (!commits[0] && last_commit == commit[0]){
                    return
                }
                request(make_api_set_status_req(
                    repo_owner,
                    repo_name,
                    commit[0],
                    {state: "success", description: "Time log exist in commit message"}
                ))
            })
            commits[2].forEach(function(commit){
                request(make_api_set_status_req(
                  repo_owner,
                  repo_name,
                  commit[0],
                  {state: "failure", description: "Commit message doesn't have time log"}
                ))
            })
            
            if (!commits[0]){
                request(make_api_set_status_req(
                  repo_owner,
                  repo_name,
                  last_commit,
                  {state: "failure", description: "Some commit messages doesn't have time logs"}
                ))
            }
          }else{
            // TODO NOT GITHUB WEBHOOK
          }
      }
  ])
}


app.post('/', function(req, res) {
  execute_on_full_recieve(req, main)
  res.send('ok')
})
app.listen(3000)
