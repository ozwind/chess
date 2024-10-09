const firebaseConfig = {
    apiKey: "AIzaSyCCUz89sbc1i1rJctu5cW5GKtVdoZiymIU",
    authDomain: "chat-6eb4f.firebaseapp.com",
    databaseURL: "https://chat-6eb4f-default-rtdb.firebaseio.com",
    projectId: "chat-6eb4f",
    storageBucket: "chat-6eb4f.appspot.com",
    messagingSenderId: "212676186308",
    appId: "1:212676186308:web:e31fb87dea7d777e33f991",
    measurementId: "G-BYZLC05BHM"
};

// Message types between users:
const TYPE_JOIN = "join";
const TYPE_ACCEPT = "accept";
const TYPE_DECLINE = "decline";
const TYPE_SESSION_END = "sessionEnd";
const TYPE_MOVE = "move";
const TYPE_UNDO = "undo";
const TYPE_REDO = "redo";
const TYPE_REWIND = "rewind";
const TYPE_FF = "fastForward";
const TYPE_CLEAR = "clear";
const TYPE_VM_SLIDER = "validMoves";
const TYPE_LOAD = "load";

const STOP = "#btnStop";
const MSG_JOIN = "#msgJoin";
const MESSAGES = "messages";
const USERS = "users";
const HANDLE = "#handle";
const EMAIL = "#email";
const PWD = "#password";
const USR_STORE = "userStore";
const DLG_LOGIN = "#dlgLogin"
const DLG_JOIN = "#dlgJoin";
const sender = Math.random().toString(36).substring(2);

let $dlgLogin;
let database;
let auth;
let messagesRef;
let fbUserMap = {};
let userLoggedIn;
let cbMap = {};

async function fbInit(map) {
    initLoginDialog();
    initJoinDialog();
    cbMap = map;
    firebase.initializeApp(firebaseConfig);          // Initialize Firebase
    database = firebase.database();                  // Database service reference
    auth = firebase.auth();                          // Authentication
    messagesRef = firebase.database().ref(MESSAGES); // Reference to the messages

    await getUsers();

    // Receive messages:
    firebase.database().ref(MESSAGES).on('value', (snapshot) => {
        snapshot.forEach((childSnapshot) => {
            const messageData = childSnapshot.val();
            const messageKey = childSnapshot.key;  // Get the unique key for each message

            if (cbMap.receiveMessage) {
                cbMap.receiveMessage(messageData);
            }

            // Remove the message from the database after displaying it
            const messageRef = firebase.database().ref(`messages/${messageKey}`);
            messageRef.remove();  // Delete the message from Firebase
        });
    });

    // Update user on-line/off-line status
    auth.onAuthStateChanged((user) => {
        onAuthStateChanged(user);
    });

    // Show list of users that are on-line
    const onlineUsersRef = database.ref(USERS);
    onlineUsersRef.on('value', (snapshot) => {
        snapshot.forEach((childSnapshot) => {
            const val = childSnapshot.val();
            const uid = childSnapshot.key;
            const handle = val.handle;
            const online = val.online;
            let changed = hasChanged(val.email, handle, online, uid);
            
            fbUserMap[val.email] = {handle, online, uid, changed};
        });
        if (cbMap.online) {
            cbMap.online(fbUserMap);
        }
    });
}

function hasChanged(email, handle, online, uid) {
    let entry = fbUserMap[email];

    if (entry) {
        if (entry.hasOwnProperty('changed')) {
            return !(handle === entry.handle && online === entry.online && uid === entry.uid);
        }
        else if (!entry.online) {
            return false;  // ignore offline
        }
    }

    return true;
}

function fbSend(text, toHandle, isJson) {
    if (!userLoggedIn) {
        alert("User not logged in");
        return;
    }
    let timestamp = Date.now();
    let handle = userLoggedIn.handle;
    let msg = {text, handle, timestamp, sender};

    if (toHandle && isJson) {
        msg.toHandle = toHandle;
        msg.isJson = isJson;
    }

    messagesRef.push(msg);
}

function fbUserLogout() {
    auth.signOut()
    .then(() => {
        //console.log("User signed out");
    })
    .catch((error) => {
        console.error("Error signing out:", error);
    });
}

function fbGetUserStore() {
    let json = localStorage.getItem(USR_STORE);

    if (json) {
        return JSON.parse(json);
    }
}

function fbSendPeer(type, handle, payload) {
    let obj = {type, handle};
    if (payload) {
        obj.payload = payload;
    }
    let json = JSON.stringify(obj);
    fbSend(json, handle, true);       // true for json
}

function fbShowButton(name, show) {
    if (show) {
        $(name).removeClass('hide');
    }
    else {
        $(name).addClass('hide');
    }
}

function fbShowLoginDialog() {
    let usr = fbGetUserStore();

    if (usr) {
        $(HANDLE).val(usr.handle);
        $(EMAIL).val(usr.email);
        $(PWD).focus();               // focus on password
    }

    $dlgLogin.dialog('open');
}

function fbShowJoinDialog(data) {
    let $msg = $(MSG_JOIN);
    $msg.text(data.msg);
    $msg.attr("handle", data.handle);

    $(DLG_JOIN).dialog('open');
}

function initLoginDialog() {
    $dlgLogin = $(DLG_LOGIN);

    $dlgLogin.dialog({
        autoOpen: false, // Dialog won't open automatically on page load
        modal: true, // Enable modal behavior
        buttons: {
            Ok: function() {
                userLogin();
            },
            Cancel: function() {
                closeLoginDialog();
            }
        }
    });

    hideDlgTitlebar($dlgLogin);
    const ok = $('.ui-dialog button:contains("Ok")');
    let $dlgInput = $(DLG_LOGIN + ' input');
    $dlgInput.on('keydown', function(event) {
        if (event.keyCode === 13 && !ok.prop('disabled')) {
            ok.click();
        }
    });

    $dlgInput.on('input', function() {
        validateLoginOkButton();
    });

    validateLoginOkButton();
}

function hideDlgTitlebar($dlg) {
    $dlg.parent().find('.ui-dialog-titlebar').hide();
}

function initJoinDialog() {
    let $dlg = $(DLG_JOIN);

    $dlg.dialog({
        autoOpen: false, // Dialog won't open automatically on page load
        modal: true,     // Enable modal behavior
        buttons: {
            Accept: function() {
                let handle = getJoinHandle();
                fbSendPeer(TYPE_ACCEPT, handle);
                fbShowButton(STOP, true);
                session.handle = handle;
                $dlg.dialog('close');
            },
            Decline: function() {
                fbSendPeer(TYPE_DECLINE, getJoinHandle());
                $dlg.dialog('close');
            }
        }
    });

    hideDlgTitlebar($dlg);
}

function getJoinHandle() {
    return $(MSG_JOIN).attr("handle");
}

function getUsers() {
    return database.ref(USERS).once('value').then((snapshot) => {
        if (!snapshot.exists()) {
            return null;
        }

        snapshot.forEach((childSnapshot) => {
            const val = childSnapshot.val();
            const uid = childSnapshot.key;
            const handle = val.handle;
            const online = val.online;
            fbUserMap[val.email] = {handle, online, uid};
        });
    }).catch((error) => {
        console.error('Error fetching handle:', error);
        return null; // return null if there's an error
    });
}

async function onAuthStateChanged(user) {
    if (user) {
        const handle = fbUserMap[user.email].handle;
        const userStatusRef = database.ref(USERS + '/' + user.uid);
        const isOnline = {
            online: true,
            email: user.email,
            handle: handle,
            last_changed: firebase.database.ServerValue.TIMESTAMP
        };
        const isOffline = {
            online: false,
            email: user.email,
            handle: handle,
            last_changed: firebase.database.ServerValue.TIMESTAMP
        };

        if (cbMap.loggedIn) {
            user.handle = handle;
            cbMap.loggedIn(user);
        }
        userStatusRef.set(isOnline);
        userStatusRef.onDisconnect().set(isOffline);
        window.addEventListener('beforeunload', () => {
            userStatusRef.set(isOffline); // Update status when the user leaves
        });
    }
    else {
        if (cbMap.loggedIn) {
            cbMap.loggedIn();
        }
        if (userLoggedIn) {
            const userStatusRef = database.ref(USERS + '/' + userLoggedIn.uid);
            const isOffline = {
                online: false,
                email: userLoggedIn.email,
                handle: userLoggedIn.handle,
                last_changed: firebase.database.ServerValue.TIMESTAMP
            };
            userStatusRef.set(isOffline);
        }
    }

    if (cbMap.userState) {
        cbMap.userState(user);
    }

    userLoggedIn = user;
}

function signIn(handle, email, password) {
    fbUserMap[email].handle = handle;
    auth.signInWithEmailAndPassword(email, password)
    .then((userCredential) => {
        // User signed in
        closeLoginDialog();
    })
    .catch((error) => {
        if ("auth/invalid-credential" === error.code) {
            resetPassword(email);
        }
        else {
            console.error("Error signing in:", error);
        }
    });
}

function signedUp(email) {
    let keys = Object.keys(fbUserMap);

    for (let i = 0; i < keys.length; i++) {
        let key = keys[i];
        if (email === key) {
            return true;     // signed up
        }
    }

    return false;  // not signed up
}

function signUpUser(handle, email, password) {
    fbUserMap[email] = {handle, online};
    auth.createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
        console.log("User signed up:", userCredential.user);
        fbUserMap[email].uid = userCredential.user.uid;
        closeLoginDialog();
    })
    .catch((error) => {
        console.error("Error signing up:", error.message);
    });
}

function resetPassword(email) {
    const confirmed = confirm('Reset password at email: ' + email + ' ?');

    if (confirmed) {
        auth.sendPasswordResetEmail(email)
        .then(() => {
            alert("Password reset email sent! Please check your inbox.");
        })
        .catch((error) => {
            alert("Error: " + error.message);
        });
    }
}

function userLogin() {
    const handle = $(HANDLE).val().trim();
    const email = $(EMAIL).val().trim();
    const password = $(PWD).val().trim();
    let json = JSON.stringify({handle, email});

    if (isDuplicateHandle(handle, email)) {
        alert("Handle '" + handle + "' is already taken, choose another.");
        return;
    }
    
    localStorage.setItem(USR_STORE, json);

    if (!signedUp(email)) {
        signUpUser(handle, email, password);
    }
    else {
        signIn(handle, email, password);
    }
}

function isDuplicateHandle(handle, email) {
    let keys = Object.keys(fbUserMap);

    for (let i = 0; i < keys.length; i++) {
        let key = keys[i];
        let usr = fbUserMap[key];
        if (email !== key && handle === usr.handle) {
            return true;     // duplicate
        }
    }
}

function validateLoginOkButton() {
    const btn = $('.ui-dialog button:contains("Ok")');
    const handle = $(HANDLE).val().trim();
    const email = $(EMAIL).val().trim();
    const password = $(PWD).val().trim();

    btn.prop('disabled', handle.length < 1 || email.length < 1 || password.length < 1);
}

function closeLoginDialog() {
    $dlgLogin.dialog('close');
}
