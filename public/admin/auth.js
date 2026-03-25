const MASTER_ADMIN = "VCSNLSzYV2WsNG93mPE2ZtwdTna2";
firebase.auth().onAuthStateChanged(user => {
    if(!user || user.uid !== MASTER_ADMIN){
        alert("Unauthorized Access!");
        window.location.href = "../home.html";
    }
});
