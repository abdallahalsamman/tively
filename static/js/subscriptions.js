/* Flow Switcher */
"use strict";
function startFlowSwitcher() {
    function e(e) {
        var t = 0;
        while (e = e.previousElementSibling) ++t;
        return t
    }
    var t = document.querySelectorAll("#flow-switcher > li"),
        n = document.querySelectorAll("#flow-boxes .codebox-container .codebox"),
        r = document.querySelectorAll("#flow-boxes .text"),
        i = document.querySelector("#flow-boxes .codebox-container"),
        s = document.querySelector("#flow-boxes .boxes"),
        o = document.querySelector("#flow-boxes .end");
    for (var u = 0; u < t.length; ++u) t[u].addEventListener("mouseover", function(u) {
        u.stopPropagation();
        var a = document.querySelector("#flow-switcher .active"),
            f = u.target.nodeName == "SPAN" ? u.target.parentNode : u.target;
        if (a == f) return;
        var l = e(a),
            c = e(f);
        $(s).toggleClass("active", c != t.length - 1), $(o).toggleClass("active", c == t.length - 1), c == t.length - 1 ? ($(i).removeClass("active"), $(i).addClass("hiddenLeft")) : ($(i).removeClass("hiddenLeft"), $(i).addClass("active"));
        for (var h = 0; h < t.length; ++h) h < t.length - 1 && $(n[h]).removeClass("hiddenLeft active hiddenRight"), $(r[h]).removeClass("hiddenLeft active hiddenRight"), h < c ? (t[h].className = "done", h < t.length - 1 && $(n[h]).addClass("hiddenLeft"), $(r[h]).addClass("hiddenLeft")) : h == c ? (t[h].className = "active", h < t.length - 1 && $(n[h]).addClass("active"), $(r[h]).addClass("active")) : h > c && (t[h].className = "", h < t.length - 1 && $(n[h]).addClass("hiddenRight"), $(r[h]).addClass("hiddenRight"))
    })
}
