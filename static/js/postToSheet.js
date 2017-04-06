// Variable wuccessCallBackto hold request
var request;

// Bind to the submit event of our form
$("#postEmail").submit(function(event){

    // Prevent default posting of form - put here to work in case of errors
    event.preventDefault();

    // Abort any pending request
    if (request) {
        request.abort();
    }
    // setup some local variables
    var $form = $(this);

    // Let's select and cache all the fields
    var $inputs = $form.find("input, select, button, textarea");

    // Serialize the data in the form
    var serializedData = $form.serialize();

    // Let's disable the inputs for the duration of the Ajax request.
    // Note: we disable elements AFTER the form data has been serialized.
    // Disabled form elements will not be serialized.
    $inputs.prop("disabled", true);

    // Get the modal
    var modal = document.getElementById('myModal');

    var google_form_url = "https://docs.google.com/a/lobolabshq.com/forms/d/e/1FAIpQLScnFCrskLPUUBYxK4oZGU66eQKiHVoqEpTeHvV26-gc0W0vuA/viewform" 

    var emailEntered = $form.find('input')[0]['value'];
    // add email to form url to prepopulate with email
    google_form_url += "?entry.1348267573="+emailEntered;
    document.getElementById('google_form').src = google_form_url;

	// When the user clicks anywhere outside of the modal, close it
	window.onclick = function(event) {
		if (event.target == modal) {
			modal.style.display = "none";
		}
	}

    var successCallback = function() {
        $inputs.prop("disabled", false);
        modal.style.display = "block";
        console.log("it worked");
    }

    var failCallback = function() {
        console.log("it failed");
    }

    var url = "https://script.google.com/macros/s/AKfycbyZ9o-3TLXnlxIqOmXsqp2rAWTS15bbNgvv2kkBc3mhQWOHrw/exec?" + serializedData +"&callback=?";
    $.getJSON(url, successCallback).fail(failCallback)


    fbq('track', 'CompleteRegistration', {
        email: emailEntered
    });

    ga('send', 'event', 'interest', 'addEmail', emailEntered);

});
