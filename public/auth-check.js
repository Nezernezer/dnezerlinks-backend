// This checks if a user exists in the browser's memory
const activeUser = localStorage.getItem('currentUser');

if (!activeUser) {
    alert("Please login to access Dnezerlinks services.");
    window.location.href = "/login.html"; // Redirects them if they aren't logged in
}

// Global Footer Injection
window.addEventListener('load', function() {
    const footer = document.createElement('div');
    footer.className = 'footer-info';
    footer.innerHTML = 'Dnezerlinks Business Manager v2.0';
    document.body.appendChild(footer);
});
