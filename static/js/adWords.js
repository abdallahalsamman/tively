$(document).ready(function() {

	var pingAdWords = function(url) {
        page = "/"+url+".html";
		console.log("setting adWords page to: "+page);
		ga ('set', 'page', page);
		console.log("sending pageview of page: "+page);
		ga ('send', 'pageview');
	};

	var bindLinks = function() {
		$('a').each(function() {
			$(this).click(function() {
				// get the page title
				str = this.href;
				var poundIndex = str.indexOf('#');
				title = str.substring(poundIndex+1);
				console.log("binding :"+title+" to "+this.href);
				pingAdWords(title);
			});
		});
	};

	bindLinks();
});



