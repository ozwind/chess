/**
    Author:      Cliff Hewitt
    Contributor: Larry Hewitt
    Inception:   September 6, 2024

    Web-sites used for development:
      www.virtualpieces.net
      https://en.wikipedia.org/wiki/Chessboard#/media/File:Chess_board_opening_staunton.jpg
      https://www.remove.bg/upload          remove background on alpha channel
      https://www3.lunapic.com/editor/      icon editor
      https://en.wikipedia.org/wiki/Forsyth%E2%80%93Edwards_Notation   FEN file format
      https://en.wikipedia.org/wiki/Portable_Game_Notation             PGN file format

    Wish list:
    1. Xray - piece behind piece that poses threat
    2. Loaded .pgn support for promotion
    3. Two people play a game across internet
    
    Release notes
    2024-Sep-07: Highlight valid moves, Save, Load
    2024-Sep-08: Attack indicator, capture pen, pawn movement rules, piece transparency
    2024-Sep-14: New icons, add row/column labels, separate discard areas, show/remember moves,
                 pawn en passant and castle valid moves
    2024-Sep-18: Actual castle, save/load with moves, legal moves toggle button,
                 capture ability, when toggle on allow only legal moves and start with white
    2024-Sep-21: Handle attack/capture red/orange border at same time
                 Add new back button to undo previous move
                 Blue square notation for attackers/defenders
                 Check for King in check and only allow moves that defend King (function handleInCheck)
    2024-Sep-25: Add forward button
                 Save file format changed to support initial piece positions (updated 1992Fischer.chs)
                 Loaded files now start initial piece positions saved in file, use forward button to see moves
                 Invalid piece moves are no longer rememebered in moveList
                 Changing to invalid moves removes all undo/redo, and affects starting position when saved
                 Animate piece moves (see function movePiece)
                 Debounce undo/redo button
                 Enable/disable back/forward (undo/redo) at appropriate times
                 Text colors changed for attackers/defenders info
                 Remove red/orange boxes; show attackers on hovered square
                 Move table with 3 columns: number, white move, black move
    2024-Sep-26: Hover over piece now changes background to light green
                 Hover shows info for both sides that can attack or protect the hovered piece
                 Middle info row shows threats on blue highlight squares (see function updateThreats)
    2024-Sep-28: Update defender info text for each highlight square, as if piece was moved.
                 Load FEN files. Supports en-passant and castle.
    2024-Oct-03: Left/right arrow keys shortcuts for undo/redo (back/forward).
                 Info button added.  When clicked shows informational dialog about the web-app.
                 Provide ability to promote pawn to queen, rook, bishop, or knight.
                 Load PGN files.  Promotion is currently not supported.
    2024-Oct-06: Add rewind and fast forward buttons.
    2024-Oct-09: Connect with other users, chat, login/out, clear moves button
    2024-Oct-13: Flip chessboard ability added
    2024-Oct-14: On join, pass piece positions to synchronize chessboard
    2024-Oct-15: On piece drop evaluate if legal, and if so allow drop, otherwise move piece back.
**/

const SIZE = 8;    // Chessboard rows and columns
const VALID = "#cbValid";
const CLEAR = "#clear";
const UNDO = "#undo";
const REDO = "#redo";
const REWIND = "#rewind";
const FF = "#fastForward";
const INFO = "#infoDialog";
const CHESS_INFO = "#chess-info";
const PROMOTE = "#promoteDialog";
const ANIM_DEBOUNCE_MS = 300;  // milliseconds move animation and button debounce
const LOGIN = "#btnLogin";
const LOGOUT = "#btnLogout";
const LOGGEDINUSER = "#loggedInUser";
const CHATTING = "#chatting";
const CHAT_AREA = "#chatArea";
const CHAT_SEND = "#chatSend";
const ROW_LABEL = "rowLabel";
const CELL_COLOR = "off-white";

let debounceTimer;
let fenStatus = {}; // used when FEN file is loaded to remember castle and en passant
let starting = {};  // starting position of all pieces on chessboard and discard piles
let moveList = [];
let moveRedo = [];
let session = {};

function init() {
    initBoard();
    initLabels();
    loadGrid(initGrid());
    initDialogs();
    fbInit({online, userState, receiveMessage});

    $("#save").on('click', function() {
        save();
    });

    $("#load").on('click', function() {
        load();
    });

    $(CLEAR).on('click', function() {
        clear();
    });

    $(LOGIN).click(function() {
        fbShowLoginDialog();
    });

    $(LOGOUT).click(function() {
        fbUserLogout();
        $(LOGGEDINUSER).text("");
        fbShowButton(STOP, false);
        session = {};
    });

    $(STOP).click(function() {
        stopSession();
    });

    $("#flip").on('click', function() {
        flipChessboard();
    });

    $("#info").on('click', function() {
        info();
    });

    $(REWIND).on('click', function() {
        debounce(rewind);
    });

    $(UNDO).on('click', function() {
        debounce(undo);
    });

    $(REDO).on('click', function() {
        debounce(redo);
    });

    $(FF).on('click', function() {
        debounce(fastForward);
    });

    $(VALID).on('click', function() {
        clickValidMoves();
    });

    $(document).keydown(function(event) {
        keydown(event);
    });

    $(CHAT_SEND).on('keydown', function(event) {
        chatSend(event);
    });
    
    $(CHAT_AREA).on('click', '.usrHandle', function() {
        requestJoin($(this).text());
    });
}

function stopSession() {
    fbShowButton(STOP, false);
    fbSendPeer(TYPE_SESSION_END, session.handle);
    session = {};
}

function chatSend(event) {
    if (event.keyCode === 13) {
        let $send = $(CHAT_SEND);
        let val = $send.val();
        if (val.length > 0) {
            fbSend(val);
            $send.val("");
        }
    }
}

function requestJoin(toHandle) {
    let usr = fbGetUserStore();
    let handle = usr ? usr.handle : "";
    let keys = Object.keys(fbUserMap);

    for (let i = 0; i < keys.length; i++) {
        let key = keys[i];
        let entry = fbUserMap[key];
        if (toHandle === entry.handle) {
            if (entry.online) {
                let type = TYPE_JOIN;
                let msg = handle + " invites you to join";
                let onlyValid = onlyValidMoves();
                let join = {starting, moveList, moveRedo, onlyValid};
                let cmd = {type, msg, handle, join};
                let json = JSON.stringify(cmd);
                let confirmed = confirm("Invite " + toHandle + " to join?");
                if (confirmed) {
                    fbSend(json, toHandle, true);
                }
            }
            else {
                alert(toHandle + " is offline");
            }
            break;
        }
    }
}

function online(map) {
    let usr = fbGetUserStore();
    let email = usr ? usr.email : "";
    let keys = Object.keys(map);

    for (let i = 0; i < keys.length; i++) {
        let key = keys[i];
        let entry = map[key];

        if (email !== key && entry.changed) {
            let msg = entry.online ? "on-line" : "off-line";
            addMessage(false, entry.handle, msg);
            if (!entry.online && entry.handle === session.handle) {
                fbShowButton(STOP, false);
                session = {};
                alert(entry.handle + " has gone off-line.  Ending session.");
            }
        }
    }
}

function userState(user) {
    if (user) {
        fbShowButton(LOGIN, false);
        fbShowButton(LOGOUT, true);
        $(CHATTING).removeClass("hide");
        $(LOGGEDINUSER).text(user.handle + " (" + user.email + ")");
    }
    else {
        fbShowButton(LOGIN, true);
        fbShowButton(LOGOUT, false);
        $(CHATTING).addClass("hide");
        $(LOGGEDINUSER).text("");
    }
}

function receiveMessage(data) {
    if (data.isJson && data.toHandle) {
        let usr = fbGetUserStore();
        let handle = usr ? usr.handle : "";
        if (data.handle !== handle && data.toHandle === handle) {
            let cmd = JSON.parse(data.text);
            if (TYPE_JOIN === cmd.type) {
                fbShowJoinDialog(cmd);
            }
            else if (TYPE_MOVE === cmd.type) {
                let move = JSON.parse(cmd.payload);
                remoteMove(move);
            }
            else if (TYPE_UNDO === cmd.type) {
                undo();
            }
            else if (TYPE_REDO === cmd.type) {
                redo();
            }
            else if (TYPE_REWIND === cmd.type) {
                rewind();
            }
            else if (TYPE_FF === cmd.type) {
                fastForward();
            }
            else if (TYPE_CLEAR === cmd.type) {
                doClear();
            }
            else if (TYPE_VM_SLIDER === cmd.type) {
                remoteSlider();
            }
            else if (TYPE_LOAD === cmd.type) {
                let obj = JSON.parse(cmd.payload);
                doLoad(obj.filename, obj.fileText);
            }
            else if (TYPE_ACCEPT === cmd.type) {
                session.handle = data.handle;
                fbShowButton(STOP, true);
            }
            else if (TYPE_DECLINE === cmd.type) {
                alert(data.handle + " declined");
            }
            else if (TYPE_SESSION_END === cmd.type) {
                fbShowButton(STOP, false);
                alert(data.handle + " ended session");
                session = {};
            }
        }
    }
    else {
        addMessage(sender === data.sender, data.handle, data.text);
    }
}

function remoteSlider() {
    let $cb = $(VALID);
    $cb.prop('checked', !$cb.prop('checked'));
    validMoves();
}

function remoteMove(move) {
    applyMove(move);

    if (!(move.src.startsWith("discard") || move.dst.startsWith("discard"))) {
        moveList.push(move);
        tableMsg(move);
        updateButtonState();
    }

    cellInfoUpdate();
}

function addMessage(me, handle, text) {
    let bold = me ? ['<b>','</b>'] : ['',''];
    let cls = me ? "" : "usrHandle";
    let msg = bold[0] + "[<div class='" + cls + "'>" + handle + "</div>]&nbsp;" + bold[1] + text;
    let $text = $(CHAT_AREA);
    let $div = $("<div class='msgEntry'>");
    $div.html(msg);
    $text.append($div);
    $text.scrollTop($text[0].scrollHeight);

}

function clear() {
    doClear();

    if (session.handle) {
        fbSendPeer(TYPE_CLEAR, session.handle);
    }
}

function doClear() {
    starting = initStarting();
    loadGrid(starting);
    setValidMoves(true);
    moveList.length = 0;
    moveRedo.length = 0;
    setDefaultTitle();
    updateButtonState();
    cellInfoUpdate();
}

function keydown(event) {
    if (event.key === "ArrowLeft") {
        arrowKey(UNDO, undo);
    }
    else if (event.key === "ArrowRight") {
        arrowKey(REDO, redo);
    }
    else {
        showButtonFocus(true);
    }
}

function arrowKey(name, func) {
    if (isEnabled(name)) {
        showButtonFocus(false);
        debounce(func);
    }
}

// Shows or hides button focus outline
function showButtonFocus(show) {
    let $btn = $("button");

    if (show) {
        $btn.removeClass("arrow");
    }
    else {
        $btn.addClass("arrow");
    }
}

function debounce(func) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function() {
        func();
        if (session.handle) {
            if (undo === func) {
                fbSendPeer(TYPE_UNDO, session.handle);
            }
            else if (redo === func) {
                fbSendPeer(TYPE_REDO, session.handle);
            }
            else if (rewind === func) {
                fbSendPeer(TYPE_REWIND, session.handle);
            }
            else if (fastForward === func) {
                fbSendPeer(TYPE_FF, session.handle);
            }
        }
    }, ANIM_DEBOUNCE_MS);
}

function setEnabled(name, enabled) {
    if (enabled) {
        $(name).prop('disabled', false).removeClass('disabled');
    }
    else {
        $(name).prop('disabled', true).addClass('disabled');
    }
}

function isEnabled(name) {
    return !$(name).hasClass('disabled');
}

// Update undo/redo button enabled states
function updateButtonState() {
    let allowUndo = moveList.length > 0;

    if (moveList.length === 1 && moveList[0].nop) {
        allowUndo = false;
    }
    setEnabled(REWIND, allowUndo);
    setEnabled(UNDO, allowUndo);
    setEnabled(REDO, moveRedo.length > 0);
    setEnabled(FF, moveRedo.length > 0);
}

function initBoard() {
    let $board = $("#chess-board");
    let offWhite = false;

    for (let row = 0; row < SIZE; row++) {
        offWhite = (row % 2) === 0 ? false : true;

        for (let col = 0; col < SIZE; col++) {
            let $cell = $("<div class='square'></div>");
            if (offWhite) {
                $cell.addClass(CELL_COLOR);
            }
            $board.append($cell);
            offWhite = !offWhite;            
        }
    }
}

function initLabels() {
    let $rowLabels = $("#rowLabels");

    for (var row = SIZE; row > 0; row--) {
        let $row = $("<div class='" + ROW_LABEL + "'></div>");
        $row.text(row);
        $rowLabels.append($row);
    }

    let $colLabels = $("#colLabels");

    for (let i = 0; i < SIZE; i++) {
        let lbl = String.fromCharCode('a'.charCodeAt(0) + i);
        let $col = $("<div class='colLabel'><div>");
        $col.text(lbl);
        $colLabels.append($col);
    }
}

function boardFlipped() {
    let num = Number($("." + ROW_LABEL).first().text());
    return num === 1;
}

function flipChessboard() {
    let $imgs = $(".grid-item img");

    // Flip board piece positions:
    for (let i = 0; i < $imgs.length; i++) {
        let $img = $($imgs[i]);
        let val = $img.attr("value");
        let player = getPlayer(val);
        let $item = $img.parent();
        let pos = toRowCol($item);
        let sRow = SIZE - pos[0] - 1;
        let $sItem = getGridItem(sRow, pos[1]);
        $sItem.append($img);
    }

    // Flip chessboard colored cells
    let $cells = $("#chess-board div");
    let showColor = !boardFlipped();
    for (let i = 0; i < $cells.length; i++) {
        let $cell = $($cells[i]);
        if (showColor) {
            $cell.addClass(CELL_COLOR);            
        }
        else {
            $cell.removeClass(CELL_COLOR);
        }
        if ((i % SIZE) < (SIZE - 1)) {
            showColor = !showColor;
        }
    }

    // Flip info text within each cell
    let $infos = $(".info");
    for (let i = 0; i < $infos.length; i++) {
        let $info = $($infos[i]);
        let $elems = $info.children();
        $info.append($elems.get().reverse());   // reverse order and append
    }

    // Flip rank row labels on left side of chessboard
    let $lbls = $("." + ROW_LABEL);
    if (boardFlipped()) {
        for (let i = 0; i < SIZE; i++) {
            $($lbls[i]).text(SIZE - i);
        }
    }
    else {
        for (let i = 0; i < SIZE; i++) {
            $($lbls[i]).text(i + 1);
        }        
    }

    // Flip discard piles:
    let $right = $("#rightSide");
    var $elems = $right.children();
    $right.append($elems.get().reverse());   // reverse order and append
}

function updateStarting() {
    let board = [];
    let $items = $(".grid-item");

    for (var i = 0; i < $items.length; i++) {
        let $item = $($items[i]);
        let $img = $item.find('img');
        if ($img.length < 1) {
            board.push('');
        }
        else {
            board.push($img.attr('value'));
        }
    }

    let discardWhite = [];
    let discardBlack = [];
    let $discards = $(".discardPile img");

    for (let i = 0; i < $discards.length; i++) {
        let $img = $($discards[i]);
        let val = $img.attr('value');
        if (isWhite($img)) {
            discardWhite.push(val);
        }
        else {
            discardBlack.push(val);
        }
    }

    starting = {board, discardBlack, discardWhite};
}

function initStarting() {
    const player1 = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'];
    const player2 = ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];    
    let board = Array(SIZE * SIZE).fill('');
    let discardWhite = [];
    let discardBlack = [];

    board.splice(0, player1.length, ...player1);
    board.splice(board.length - player2.length, player2.length, ...player2);

    return {discardWhite, discardBlack, board};
}

function initGrid() {
    let $grid = $('#grid');
    let $info = $(CHESS_INFO);

    starting = initStarting();   // starting is global object of starting piece positions

    for (let i = 0; i < starting.board.length; i++) {
        let row = Math.floor(i / SIZE);
        let col = i % SIZE;
        let $item = $('<div class="grid-item holder"></div>');
        $item.attr('row', row);
        $item.attr('col', col);
        $grid.append($item);

        let $div = $("<div>");
        $div.addClass("info");
        $div.attr('row', row);
        $div.attr('col', col);
        initInfo($div, "B");  // Black
        initInfo($div, "T");  // Threat
        initInfo($div, "W");  // White
        $info.append($div);
    }

    return starting;
}

function initInfo($container, side) {
    let $div = $("<div>");
    let $span = $("<span>");
    $span.addClass("info" + side);
    $div.append($span);
    $container.append($div);
}

function setInfo(row, col, side, msg) {
    let $item = getInfoItem(row, col);
    let $span = $item.find(".info" + side);
    $span.text(msg);
}

function getInfo(row, col, side) {
    let $item = getInfoItem(row, col);
    let $span = $item.find(".info" + side);
    return $span.text();
}

function getInfoItem(row, col) {
    let $items = $(".info");
    let index = row * SIZE + col;
    return $($items[index]);    
}

function clearMoves() {
    $("#moves").empty();
}

function loadGrid(data) {
    let $items = $(".grid-item");

    $items.empty();
    $(".discardPile").empty();
    clearMoves();
    fenStatus = {};

    if (boardFlipped()) {
        for (let i = 0; i < SIZE / 2; i++) {
            for (let j = 0; j < SIZE; j++) {
                let idx1 = i * SIZE + j;
                let idx2 = (SIZE - i - 1) * SIZE + j;
                let temp = data.board[idx1];
                data.board[idx1] = data.board[idx2];
                data.board[idx2] = temp;
            }
        }
    }

    for (var i = 0; i < data.board.length; i++) {
        let cell = data.board[i];
        let $item = $($items[i]);

        if (cell.length > 0) {
            let image = addNewPiece($item, cell);
            initMouseEvents(image);
        }
    }

    loadDiscards(data);
    updateButtonState();
    cellInfoUpdate();
    initDragDrop();
}

// Used for testing.  Can be removed.
function test() {
    for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
            setInfo(row, col, "T", "PRBQKN");
        }
    }
}

function loadDiscards(data) {
    if (data.discardWhite) {
        let $discardWhite = $("#discardWhite");
        $discardWhite.empty();
        for (let i = 0; i < data.discardWhite.length; i++) {
            let image = addNewPiece($discardWhite, data.discardWhite[i]);
            initMouseEvents(image);
        }
    }

    if (data.discardBlack) {
        let $discardBlack = $("#discardBlack");
        $discardBlack.empty();
        for (let i = 0; i < data.discardBlack.length; i++) {
            let image = addNewPiece($discardBlack, data.discardBlack[i]);
            initMouseEvents(image);
        }
    }
}

function addNewPiece($container, val) {
    let image = new Image();

    updatePiece(image, val);
    $container.append(image);

    return image;
}

function updatePiece(image, val) {
    let color = val === val.toUpperCase() ? 'black' : 'white';    

    image.setAttribute('src', 'icons/' + color + val.toUpperCase() + '.png');
    image.setAttribute('value', val);
}

function save() {
    if (!onlyValidMoves()) {
        updateStarting();
    }

    const json = JSON.stringify({starting, moveList, moveRedo});

    // Show Save As dialog, or save to download directory, depending on Chrome settings:
    let blob = new Blob([json], { type: "text/plain" });
    let link = document.createElement("a");
    link.download = getSuggestedFilename();
    link.href = window.URL.createObjectURL(blob);
    link.click();
    window.URL.revokeObjectURL(link.href);
}

function load() {  // Show file chooser dialog, which allows loading a chess file
    var input = $('<input>').attr({
        'type': 'file',
        'accept': '.chs, .fen, .pgn', // Specify allowed file types
    });

    input.on('change', function (event) { // Listen for the "change" event on the input element
        var file = event.target.files[0]; // Get the selected file
        var filename = file.name;         // Get the name of the file
        var reader = new FileReader();

        reader.onload = function (e) {
            var fileText = e.target.result;
            try {
                doLoad(filename, fileText);
                if (session.handle) {
                    let payload = JSON.stringify({filename, fileText});
                    fbSendPeer(TYPE_LOAD, session.handle, payload);
                }
            }
            catch (error) {
                console.log(error);
                console.log(fileText);
                alert(error);
            }
        };

        reader.readAsText(file);
    });

    input.trigger('click'); // Trigger a click event on the input element
}

function doLoad(filename, fileText) {
    setDefaultTitle();
    if (filename.endsWith('.chs')) {
        loadChs(filename, fileText);
    }
    else if (filename.endsWith('.fen')) {
        loadFen(filename, fileText);
    }
    else if (filename.endsWith('.pgn')) {
        loadPgn(filename, fileText);
    }
    else {
        alert("Unsupported file type " + filename);
    }
}

function loadChs(filename, chs) {
    let data = JSON.parse(chs);

    moveList = data.moveList;
    moveRedo = data.moveRedo;
    starting = data.starting;
    loadGrid(starting);
    setValidMoves(true);
    let moveCount = (moveList.length + moveRedo.length) / 2;
    document.title = filename + " (" + moveCount + ")";

    for (let i = 0; i < moveList.length; i++) {
        let move = moveList[i];
        applyMove(move, true);   // true means fast, without animation
        tableMsg(move);
    }

    updateButtonState();
    cellInfoUpdate();
}

function loadFen(filename, fen) {
    let fields = fen.split(' ');

    if (fields.length < 5) {
        notFenAlert(fen);
        return;
    }

    let rows = fields[0].split('/');
    let board = Array(SIZE * SIZE).fill('');
    let discardWhite = [];
    let discardBlack = [];
    let index = 0;

    if (rows.length != SIZE) {
        notFenAlert(fen);
        return;
    }

    for (let i = 0; i < rows.length; i++) {
        let row = rows[i];
        for (let j = 0; j < row.length; j++) {
            let ch = row.charAt(j);
            if ($.isNumeric(ch)) {
                index += Number(ch);
            }
            else {
                board[index] = toggleCase(ch);
                index++;
            }
        }
    }

    starting = {board, discardBlack, discardWhite};
    handleDiscards(starting);
    loadGrid(starting);
    setValidMoves(true);
    moveList.length = 0;
    moveRedo.length = 0;

    if ("b" === fields[1]) {  // black move next ?
        let player = "W";
        let nop = true;
        let move = {player, nop};
        moveList.push(move);
        tableMsg(move);
    }

    if ("-" !== fields[2]) {  // castle
        fenStatus.castle = fields[2];
    }

    if ("-" !== fields[3]) {  // en passant
        fenStatus.enPassant = fields[3];
    }

    setValidMoves(true);
    document.title = filename;
    updateButtonState();
    cellInfoUpdate();
}

function loadPgn(filename, text) {
    let moves = parsePgn(text);  // Parsed moves
    let isWhite = true;

    starting = initStarting();
    loadGrid(starting);
    setValidMoves(true);
    moveList.length = 0;
    moveRedo.length = 0;

    for (let i = 0; i < moves.length; i++) {
        let player = isWhite ? "W" : "B";
        let pgn = moves[i].replace(/[+#]/g, '');  // Removes all '+' or '#'
        let move = movePgn(player, pgn);

        if (move) {
            isWhite = !isWhite;
            moveList.push(move);
            applyMove(move, true);   // true means fast, without animation
            handleCheckAndMate(move);
            tableMsg(move);
        }
        else {
            alert(i + ". Not handled: ", moves[i]);
            break;
        }
    }

    for (let i = moveList.length - 1; i >= 0; i--) {
        moveRedo.push(moveList[i]);
    }

    loadGrid(starting);
    moveList.length = 0;

    let moveCount = (moveList.length + moveRedo.length) / 2;
    document.title = filename + " (" + moveCount + ")";

    updateButtonState();
    cellInfoUpdate();
}

function movePgn(player, pgn) {
    let move = {player, pgn};
    let ch = pgn.length > 1 ? pgn.charAt(0) : undefined;

    if ("KQRBN".includes(ch)) {
        movePgnKQRBN(move, ch);
    }
    else if ("O" === ch) {  // Castle
        let side = "O-O" === pgn ? "right" : "left";
        let rank = "B" === move.player ? 8 : 1;
        let file = side === "left" ? "c" : "g";
        move.piece = "K";
        move.src = "e" + rank;
        move.dst = file + rank;
        move.castle = side;
        move.rook = side;
    }
    else if (undefined === ch) {
        return;   // invalid pgn
    }
    else {  // must be pawn
        movePgnPawn(move);
    }

    return move;
}

function movePgnPawn(move) {
    let piece = "B" === move.player ? "P" : "p";
    let locations = getLocations(piece);
    let file = move.pgn.substr(0, 1);
    let dst = move.pgn;

    move.src = findLocation(locations, file);

    if (move.pgn.length === 4 && "x" !== move.pgn.substr(1, 1)) {
        move.src = move.pgn.substr(0, 2);
        dst = move.pgn.substr(2);
    }
    else if (move.pgn.length === 5 && "x" === move.pgn.substr(2, 1)) {
        move.src = move.pgn.substr(0, 2);
    }

    move.piece = piece.toUpperCase();

    if (move.pgn.includes("x")) {
        move.dst = move.pgn.split("x")[1];
        let pos = posRowCol(move.dst);
        let capture = getPiece(pos[0], pos[1]).attr("value");
        if (capture) {
            move.capture = capture;
            move.capturePos = move.dst;
        }
        else {  // must be en passant, because the square is empty
            let rank = move.src.substr(1);
            file = move.dst.substr(0, 1);
            move.capture = toggleCase(piece);
            move.capturePos = file + rank;
        }
    }
    else {
        move.dst = dst;
    }
}

// Return location by file (column a to h)
function findLocation(locations, file) {
    for (let i = 0; i < locations.length; i++) {
        let loc = locations[i];
        if (loc.startsWith(file)) {
            return loc;
        }
    }
}

function movePgnKQRBN(move, ch) {
    let piece = "B" === move.player ? ch : ch.toLowerCase();
    let locations = getLocations(piece);
    let dst = move.pgn.substr(1);
    let rank;
    let file;

    move.piece = ch;

    if (move.pgn.length === 4) {
        let ch2 = move.pgn.substr(1, 1);
        dst = move.pgn.substr(2);
    
        if ("x" !== ch2) {
            if ($.isNumeric(ch2)) {
                rank = ch2;
            }
            else {
                file = ch2;
            }
        }
    }

    move.dst = dst;
    setSrc(move, locations, piece, rank, file);

    let pos = posRowCol(dst);
    let $img = getPiece(pos[0], pos[1]);

    if ($img.length > 0) {
        let val = $img.attr("value");
        move.capture = val;
        move.capturePos = dst;
    }
}

function getLocations(piece) {
    let pieces = [];
    let $imgs = $(".grid-item img[value='" + piece + "']");

    for (let i = 0; i < $imgs.length; i++) {
        let $parent = $($imgs[i]).parent();
        let row = Number($parent.attr("row"));
        let col = Number($parent.attr("col"));
        pieces.push(toLocation(row, col));
    }

    return pieces;
}

function setSrc(move, locations, piece, rank, file) {
    let posDst = posRowCol(move.dst);
    let row = posDst[0];
    let col = posDst[1];

    for (let i = 0; i < locations.length; i++) {
        let loc = locations[i];
        let pos = posRowCol(loc);
        let highlights = getHighlights(pos[0], pos[1], piece);
        for (let j = 0; j < highlights.length; j++) {
            let highlight = highlights[j];
            if (row === highlight[0] && col === highlight[1]) {
                if (rank && rank !== loc.substr(1)) {
                    continue;
                }
                if (file && file !== loc.substr(0,1)) {
                    continue;
                }
                move.src = loc;
                return;
            }
        }
    }
}

function parsePgn(pgn) {
    // Remove comments within curly braces
    pgn = pgn.replace(/\{[^}]*\}/g, '');   

    // Step 1: Remove all the PGN header tags (lines starting with [)
    let pgnWithoutTags = pgn.replace(/\[.*?\]\s*\n/g, '').trim();

    // Step 2: Normalize move numbers like '1.e4' to '1. e4' by adding a space after the period
    pgnWithoutTags = pgnWithoutTags.replace(/(\d+)\.(\S)/g, '$1. $2');

    // Step 3: Remove the ".." notation in black's move (like '3. ..a6')
    pgnWithoutTags = pgnWithoutTags.replace(/\.\./g, '');

    // Step 4: Remove '.e.p.' with the previous move, keeping it as a single entry
    pgnWithoutTags = pgnWithoutTags.replace(/(\S+\s+e\.p\.)/g, function(match) {
        return match.replace(/\s+e\.p\./, '');
    });

    // Step 5: Split the moves section by spaces and newlines, and filter unwanted characters
    let movesArray = pgnWithoutTags.split(/\s+/).filter(function(move) {
        // Filter out metadata like move numbers and result indicators (1-0, 0-1, 1/2-1/2)
        return !/^\d+\.$/.test(move) && move !== "1-0" && move !== "0-1" && move !== "1/2-1/2";
    });

    return movesArray;
}

function handleDiscards(starting) {
    let sides = "WB";
    let types = "RNBQKP";
    let counts = "222118";
    let count = 0;
    let pieces = {};

    for (let s = 0; s < sides.length; s++) {
        let side = sides.charAt(s);
        for (let t = 0; t < types.length; t++) {
            let piece = types.charAt(t);
            let max = Number(counts.charAt(t));
            if ("W" === side) {
                piece = piece.toLowerCase();
            }
            pieces[piece] = {max, count};
        }
    }

    for (let i = 0; i < starting.board.length; i++) {
        let type = starting.board[i];

        if (type.length > 0) {
            let piece = pieces[type];
            piece.count++;
        }
    }

    let keys = Object.keys(pieces);

    for (let i = 0; i < keys.length; i++) {
        let key = keys[i];
        let piece = pieces[key];
        if (piece.count < piece.max) {
            let captured = piece.max - piece.count;
            for (let j = 0; j < captured; j++) {
                if (key === key.toUpperCase()) {
                    starting.discardBlack.push(key);
                }
                else {
                    starting.discardWhite.push(key);
                }
            }
        }
    }
}

function toggleCase(character) {
    if (character >= 'a' && character <= 'z') {
        return character.toUpperCase();
    }
    else if (character >= 'A' && character <= 'Z') {
        return character.toLowerCase();
    }
    else {
        return character;
    }
}

function notFenAlert(fen) {
    alert("Not in FEN format: " + fen);
}

// Back out last move
function undo() {
    if (moveList.length > 0) {
        let len = moveList.length - 1;
        let move = moveList[len];
        let turn = playerTurn();
        let src = posRowCol(move.src);
        let dst = posRowCol(move.dst);

        if (move.promote) {
            let img = getPiece(dst[0], dst[1])[0];
            let val = "B" === move.player ? "P" : "p";
            updatePiece(img, val);
        }

        if (move.capture) {
            movePiece(dst, src);
            let id = "#discard" + ("B" === turn ? "Black" : "White");
            let $img = $(id + " img").last();
            let pos = posRowCol(move.capturePos);
            let $item = getGridItem(pos[0], pos[1]);
            $item.append($img);
        }
        else if (move.castle) {
            let row = "B" === move.player ? 0 : 7;
            let fromKing = posRowCol(move.dst);
            let toKing = posRowCol(move.src);
            let fromRook = "left" === move.rook ? [row, 3] : [row, 5];
            let toRook = "left" === move.rook ? [row, 0] : [row, 7];
            movePiece(fromKing, toKing);
            movePiece(fromRook, toRook);
        }
        else {  // regular move
            movePiece(dst, src);
        }

        moveList.length = len;
        clearMoves();
        for (let i = 0; i < moveList.length; i++) {
            tableMsg(moveList[i]);
        }
        moveRedo.push(move);
        updateButtonState();
        cellInfoUpdate();
    }
}

// Next move
function redo() {
    if (moveRedo.length > 0) {
        let move = moveRedo.pop();
        applyMove(move);
        moveList.push(move);
        tableMsg(move);
        updateButtonState();
        cellInfoUpdate();
    }
}

function rewind() {
    let nop = (moveList.length > 0 && moveList[0].nop) ? moveList[0] : undefined;

    for (let i = moveList.length - 1; i >= 0; i--) {
        if (!moveList[i].nop) {
            moveRedo.push(moveList[i]);
        }
    }

    handleDiscards(starting);
    loadGrid(starting);
    clearMoves();
    moveList.length = 0;

    if (nop) {
        moveList.push(nop);
        applyMove(nop);
        tableMsg(nop);
    }

    updateButtonState();
    cellInfoUpdate();
}

function fastForward() {
    while (move = moveRedo.pop()) {
        applyMove(move, true);           // true means fast, without animation
        moveList.push(move);
        tableMsg(move);
    }

    updateButtonState();
    cellInfoUpdate();
}

function applyMove(move, fast) {
    if (move.nop) {
        return;
    }
    else if (move.src.startsWith("discard")) {
        let $img = $("#" + move.src + " img:last-of-type");
        let pos = posRowCol(move.dst);
        let $item = getGridItem(pos[0], pos[1]);
        $item.append($img);
        return;
    }
    else if (move.dst.startsWith("discard")) {
        let pos = posRowCol(move.src);
        let $img = getPiece(pos[0], pos[1]);
        let $discard = $("#" + move.dst);
        $discard.append($img);
        return;
    }

    let src = posRowCol(move.src);
    let dst = posRowCol(move.dst);

    if (move.promote) {
        let img = getPiece(src[0], src[1])[0];
        updatePiece(img, move.promote);
    }

    if (move.capture) {
        let $discard = $("#discard" + ("W" === move.player ? "Black" : "White"));
        let pos = posRowCol(move.capturePos);
        let $img = getPiece(pos[0], pos[1]);
        movePiece(src, dst, fast);
        $discard.append($img);
    }
    else if (move.castle) {
        let fromKing = posRowCol(move.src);
        let toKing = posRowCol(move.dst);
        let row = fromKing[0];
        let fromRook = "left" === move.rook ? [row, 0] : [row, 7];
        let toRook = "left" === move.rook ? [row, 3] : [row, 5];
        movePiece(fromKing, toKing, fast);
        movePiece(fromRook, toRook, fast);
    }
    else {
        movePiece(src, dst, fast);
    }
}

function movePiece(from, to, fast) {
    let $img = getPiece(from[0], from[1]);
    let $item = getGridItem(to[0], to[1]);

    if (fast) {   // fast means no animation
        $item.append($img);
    }
    else {
        let toOffset = $item.offset();
        let imgOffset = $img.offset();
        let topDiff = toOffset.top - imgOffset.top;
        let leftDiff = toOffset.left - imgOffset.left;

        $img.animate({
            top: '+=' + topDiff,
            left: '+=' + leftDiff
        }, ANIM_DEBOUNCE_MS, function() {
            $(this).appendTo($item).css({top: '0', left: '0'});
            cellInfoUpdate();
        });
    }
}

function pieceWord(piece) {
    piece = piece.toUpperCase();

    if ("K" === piece) {
        return "King";
    }
    else if ("Q" === piece) {
        return "Queen";
    }
    else if ("N" === piece) {
        return "Knight";
    }
    else if ("B" === piece) {
        return "Bishop";
    }
    else if ("R" === piece) {
        return "Rook";
    }
    else if ("P" === piece) {
        return "Pawn";
    }
    else {
        return piece;
    }
}

function tableMsg(move) {
    let msg;

    if (move.nop) {
        msg = "...";
    }
    else {
        msg = pieceWord(move.piece) + " from " + move.src + " to " + move.dst;
    }

    if (move.castle) {
        msg += ", castle " + move.castle;
    }
    else if (move.capture) {
        msg += ", capture " + pieceWord(move.capture);
    }

    if (move.promote) {
        msg += ", promote to " + pieceWord(move.promote);
    }

    if (move.check) {
        msg += ", check";
    }
    else if (move.win) {
        let player = (move.win === "B") ? "Black" : "White";
        msg += "<br><span class='checkmate'>Checkmate</span>. " + player + " player wins!";
    }

    if (move.player === "W") {
        let num = $("#moves tr").length + 1;
        let $tr = addTableRow(num);

        $tr.find(".white").html(msg);
    }
    else {
        let $black = $('.black:empty').first();
        $black.html(msg);
    }

    let $container = $("#tableContainer");
    $container.scrollTop($container[0].scrollHeight);

}

function addTableRow(num) {
    let $moves = $("#moves");
    let $tr = $("<tr>");
    let $num = $("<td>" + num + "</td>");
    let $white = $("<td class='white'>");
    let $black = $("<td class='black'>");

    $tr.append($num);
    $tr.append($white);
    $tr.append($black);
    $moves.append($tr);

    return $tr;
}

function initMouseEvents(image) {
    let $img = $(image);

    $img.mouseenter(function() {
        overPiece($img);
    });

    $img.mouseleave(function() {
        leavePiece();
    });
}

function overPiece($img) {
    if ($img.length > 0) {
        let row = Number($img.parent().attr('row'));
        let col = Number($img.parent().attr('col'));
        let val = $img.attr('value');
        let player = getPlayer(val);
        let $item = getGridItem(row, col);
        showValidMoves(row, col, val, true);  // true = updateInfo
        showInfo(row, col, ["B", "W"]);
        $img.attr("title", "");

        let allow = true;
        let noDrop = true;
        let turn = playerTurn();
        let side = isWhite($img) ? "W" : "B";
        if (onlyValidMoves()) {
            if ($img.parent().hasClass("discardPile")) {
                allow = false;
            }
            else if (moveList.length > 0 && moveList[moveList.length - 1].win) {
                allow = false;
            }
            else if (side !== turn) {
                let player = "B" === turn ? "Black" : "White";
                $img.attr("title", player + " player turn");
            }
            else {
                noDrop = false;
            }
        }
        else {
            noDrop = false;
        }

        if (noDrop) {
            $item.addClass("hoverNoDrop");
        }
        else {
            $item.addClass("hover");
        }

        allowMove($img, allow);
    }
}

function leavePiece() {
    clearValidMoves();
    cellInfoUpdate();
    
    $('img[title]').each(function() {
        $(this).removeAttr('title');
    });
}

function allowMove($img, allow) {
    if (allow) {
        $img.addClass("allowMove");
        $img.draggable('enable');
    }
    else {
        $img.removeClass("allowMove");
        $img.draggable('disable');
    }
}

function clickValidMoves() {
    validMoves();

    if (session.handle) {
        fbSendPeer(TYPE_VM_SLIDER, session.handle);
    }
}

function validMoves() {
    allowMove($(".holder img"), !onlyValidMoves())

    if (onlyValidMoves()) {
        updateStarting();
    }
    else {
        moveList.length = 0;
        moveRedo.length = 0;
        clearMoves();
        updateButtonState();
        cellInfoUpdate();
        setDefaultTitle();
    }
}

function setDefaultTitle() {
    document.title = "Chess Trainer";
}

// return true if only valid moves are allowed
function onlyValidMoves() {
    return $(VALID).is(':checked');
}

function setValidMoves(state) {
    $(VALID).prop('checked', state);
}

function playerTurn() {
    let turn = "W";

    if (moveList.length > 0) {
        let move = moveList[moveList.length - 1];
        turn = (move.player === "B") ? "W" : "B";
    }

    return turn;
}

function getHighlights(row, col, val, checkCastles) {
    let highlights = [];
    let type = val.toUpperCase();

    if ("P" === type) {       // Pawn
        pawnValidMoves(row, col, val, highlights);
    }
    else if ("R" === type) {  // Rook
        rookValidMoves(row, col, val, highlights);
    }
    else if ("B" === type) {  // Bishop
        bishopValidMoves(row, col, val, highlights);
    }
    else if ("N" === type) {  // Knight
        knightValidMoves(row, col, val, highlights);
    }
    else if ("Q" === type) {  // Queen
        queenValidMoves(row, col, val, highlights);
    }
    else if ("K" === type) {  // King
        kingValidMoves(row, col, val, highlights, checkCastles);
    }

    return highlights;
}

function inPath(row, col, val) {
    let $items = $(".grid-item");

    for (var i = 0; i < $items.length; i++) {
        let $item = $($items[i]);
        let $img = $item.find('img');
        if ($img.length > 0) {
            let aVal = $img.attr('value');
            const aType = aVal.toUpperCase();
            let aRow = Number($item.attr('row'));
            let aCol = Number($item.attr('col'));

            if (!samePlayer(val, aVal)) {
                let highlights = getHighlights(aRow, aCol, aVal);

                for (let j = 0; j < highlights.length; j++) {
                    let cell = highlights[j];
                    if (row === cell[0] && col === cell[1]) {
                        return true;  // Found piece that can attack row, col
                    }
                }
            }
        }
    }

    return false;  // not in path
}

function playerCanMove(player) {
    let $items = $(".grid-item");
    let retVal = false;

    for (var i = 0; i < $items.length; i++) {
        let $item = $($items[i]);
        let $img = $item.find('img');
        if ($img.length > 0) {
            let aVal = $img.attr('value');
            let aType = aVal.toUpperCase();
            let aPlayer = (aVal === aType) ? "B" : "W";
            let aRow = Number($item.attr('row'));
            let aCol = Number($item.attr('col'));

            if (player === aPlayer) {
                let highlights = getHighlights(aRow, aCol, aVal);
                handleInCheck(aRow, aCol, aVal, highlights);
                if (highlights.length > 0) {
                    retVal = true;
                    break;
                }
            }
        }
    }

    return retVal;
}

function pawnAttackMoves(row, col, val, highlights) {
    let moves = [];
    let pawns = boardFlipped() ? ["p","P"] : ["P","p"];

    if (pawns[0] === val && row < (SIZE - 1)) {  // Pawn player1
        if (col > 0) {
            moves.push([row + 1, col - 1]);
        }
        if (col < (SIZE - 1)) {
            moves.push([row + 1, col + 1]);
        }
    }
    else if (pawns[1] === val && row > 0) {      // Pawn player2
        if (col > 0) {
            moves.push([row - 1, col - 1]);
        }
        if (col < (SIZE - 1)) {
            moves.push([row - 1, col + 1]);
        }        
    }

    // handle en passant
    let attacks = pawnEnPassantValidMoves(row, col, val, highlights);
    if (attacks.length > 0) {
        moves.push([attacks[0][0], attacks[0][1]]);
    }
    
    for (let i = 0; i < moves.length; i++) {
        let move = moves[i];
        let $img = getPiece(move[0], move[1]);

        if ($img.length > 0) {
            let iVal = $img.attr("value");
            if (!samePlayer(val, iVal)) {
                highlights.push(move);
            }
        }
        else {
            highlights.push(move);
        }
    }

    return allMoves(moves, highlights);
}

// Update info text within each cell
function cellInfoUpdate() {
    let map = {};
    let $items = $(".grid-item");
    let $infos = $(".info");

    $(CHESS_INFO).find('.infoB, .infoW').text("");  // Clear player info text

    for (var i = 0; i < $items.length; i++) {
        let $item = $($items[i]);
        let $img = $item.find('img');

        if ($img.length > 0) {
            let aVal = $img.attr('value');
            const aType = aVal.toUpperCase();
            let aRow = Number($item.attr('row'));
            let aCol = Number($item.attr('col'));

            let highlights = [];
            let all = [];

            if ("P" === aType) {       // Pawn
                all = pawnAttackMoves(aRow, aCol, aVal, highlights);
            }
            else if ("R" === aType) {  // Rook
                all = rookValidMoves(aRow, aCol, aVal, highlights);
            }
            else if ("B" === aType) {  // Bishop
                all = bishopValidMoves(aRow, aCol, aVal, highlights);
            }
            else if ("N" === aType) {  // Knight
                all = knightValidMoves(aRow, aCol, aVal, highlights);
            }
            else if ("Q" === aType) {  // Queen
                all = queenValidMoves(aRow, aCol, aVal, highlights);
            }
            else if ("K" === aType) {  // King
                all = kingValidMoves(aRow, aCol, aVal, highlights);
            }

            for (let j = 0; j < all.length; j++) {
                let cell = all[j];
                let player = getPlayer(aVal);
                putMap(map, player, cell[0], cell[1], aType);
            }
        }
    }

    let keys = Object.keys(map);
    keys.forEach(function(key) {
        let entry = map[key];
        setInfo(entry.row, entry.col, "B", orderPieces(entry.black));
        setInfo(entry.row, entry.col, "W", orderPieces(entry.white));
    });
}

// Combines two arrays and removes duplicates
function allMoves(moves, highlights) {
    let all = moves.concat(highlights);
    let uniqueArrays = [];
    let seen = {};  // Object to track unique arrays

    $.each(all, function(index, arr) {
        let key = JSON.stringify(arr);  // Convert the array to a string to track uniqueness
        if (!seen[key]) {
            seen[key] = true;
            uniqueArrays.push(arr);  // Push the unique array to the new list
        }
    });

    return uniqueArrays;
}

function orderPieces(inStr) {
    if (inStr.length > 0) {
        const order = "PNBRQK";  // show pieces in this order
        let outStr = "";

        for (let i = 0; i < order.length; i++) {
            let ch = order.charAt(i);
            let count = inStr.split(ch).length - 1;
            for (let j = 0; j < count; j++) {
                outStr += ch;
            }
        }

        return outStr;
    }

    return inStr;
}

function putMap(map, player, row, col, value) {
    let key = "" + row + col;
    let entry = map[key];

    if (!entry) {
        entry = {};
        entry.row = row;
        entry.col = col;
        entry.black = "";
        entry.white = "";
        map[key] = entry;
    }

    if ("B" === player) {
        entry.black += value;
    }
    else {
        entry.white += value;
    }
}

function showValidMoves(row, col, val, updateInfo) {
    const type = val.toUpperCase();
    let highlights = getHighlights(row, col, val, true);  // true = check castles

    handleInCheck(row, col, val, highlights);

    for (let i = 0; i < highlights.length; i++) {
        let pos = highlights[i];
        highlightCell(pos[0], pos[1]);
    }

    if (updateInfo) {
        updateDefenders(row, col, val, highlights);
        updateThreats(row, col, val, highlights);
    }

    return highlights;
}

function updateDefenders(row, col, val, moves) {
    let player = getPlayer(val);
    let $itemSrc = getGridItem(row, col);
    let $imgSrc = getPiece(row, col);
    let defenders = [];

    for (let i = 0; i < moves.length; i++) {
        let pos = moves[i];
        let pRow = pos[0];
        let pCol = pos[1];
        let $img = getPiece(pRow, pCol);

        if ($img.length < 1) {
            let $item = getGridItem(pRow, pCol);
            $item.append($imgSrc);                 // temporary move piece
            cellInfoUpdate();                      // recalculate defenders
            let msg = getInfo(pRow, pCol, player); // get defender info
            defenders.push({pRow, pCol, msg});     // remember it
            $itemSrc.append($imgSrc);              // move piece back
        }
    }

    cellInfoUpdate();

    for (let i = 0; i < defenders.length; i++) {   // now update defender info
        let defender = defenders[i];
        setInfo(defender.pRow, defender.pCol, player, defender.msg);
    }
}

function updateThreats(row, col, val, moves) {
    let player = getPlayer(val);
    for (let i = 0; i < moves.length; i++) {
        let pos = moves[i];
        let highlights = getHighlights(pos[0], pos[1], val);
        let text = "";
        for (let j = 0; j < highlights.length; j++) {
            let hPos = highlights[j];
            let $img = getPiece(hPos[0], hPos[1]);
            if ($img.length > 0) {
                let aVal = $img.attr("value");
                if (!samePlayer(val, aVal)) {
                    text += aVal.toUpperCase();
                }
            }
        }
        setInfo(pos[0], pos[1], "T", orderPieces(text));
    }
}

// Remove highlights that don't take King out of check
function handleInCheck(row, col, val, highlights) {
    let $tmpHolder = $("#tmpHolder");
    let $pItem = getGridItem(row, col);
    let $img = getPiece(row, col);
    let blockers = [];

    for (let i = 0; i < highlights.length; i++) {
        let pos = highlights[i];
        let $item = getGridItem(pos[0], pos[1]);
        let $cImg = getPiece(pos[0], pos[1]);
        if ($cImg.length < 1) {
            $item.append($img);          // temporary move piece to highlight
            cellInfoUpdate();
            if (!isKingCheck(val)) {
                blockers.push(pos);      // found move that protects king
            }
            $pItem.append($img);         // restore piece
        }
        else {
            $tmpHolder.append($cImg);    // temporary remove piece
            $item.append($img);          // temporary move piece to highlight
            cellInfoUpdate();
            if (!isKingCheck(val)) {
                blockers.push(pos);      // found capture that protects king
            }
            $item.append($cImg);         // restore piece
            $pItem.append($img);         // restore piece
        }
    }

    // Replace highlights with only ones that protect king
    highlights.splice(0, highlights.length, ...blockers);

    cellInfoUpdate();
}

// The cell info for each square is used to determine if king is in check
function isKingCheck(val) {
    let player = val.toUpperCase() === val ? "B" : "W";
    let opponent = "B" === player ? "W" : "B";
    let king = "B" === player ? "K" : "k";
    let $grid = $("#grid img[value='" + king + "']").parent();
    let pos = toRowCol($grid);
    let index = pos[0] * SIZE + pos[1];
    let $infos = $(".info");
    let info = $($infos[index]).find(".info" + opponent).text();

    if (info && info.length > 0 && samePlayer(val, king)) {
        let row = pos[0];
        let col = pos[1];
        return {player, row, col, info};
    }
}

function pawnValidMoves(row, col, val, highlights) {
    let pawns = boardFlipped() ? ["p","P"] : ["P","p"];
    if (pawns[0] === val) {      // Pawn player1
        let limit = (row === 1) ? row + 3 : row + 2;
        for (var r = row + 1; r < SIZE && r < limit; r++) {
            if (hasPiece(r, col)) {
                break;
            }
            else {
                highlights.push([r, col]);
            }
        }

        // Capture check
        let moves = [[1, 1], [1, -1]];
        captureCheck(moves, row, col, val, highlights);
    }
    else if (pawns[1] === val) {  // Pawn player2
        let limit = (row === 6) ? row - 3 : row - 2;
        for (var r = row - 1; r >= 0 && r > limit; r--) {
            if (hasPiece(r, col)) {
                break;
            }
            else {
                highlights.push([r, col]);
            }
        }

        // Capture check
        let moves = [[-1, -1], [-1, 1]];
        captureCheck(moves, row, col, val, highlights);
    }

    pawnEnPassantValidMoves(row, col, val, highlights);
}

// Pawn en passant
function pawnEnPassantValidMoves(row, col, val, highlights) {
    let attacks = [];
    let thisPlayer = (val === val.toUpperCase()) ? "B" : "W";
    let prevPlayer = (thisPlayer === "B") ? "W" : "B";
    let enPassRow = (thisPlayer === "B") ? 4 : 3;

    if (boardFlipped()) {
        enPassRow = (thisPlayer === "B") ? 3 : 4;
    }

    if (enPassRow === row  && (prevMove = enPassantMove(prevPlayer))) {
        let mCol = prevMove.dst.charCodeAt(0) - 'a'.charCodeAt(0);
        let delta = Math.abs(col - mCol);  // Check for enemy pawns immediately left or right
        if (delta === 1) {
            let hRow = (thisPlayer === "B") ? 5 : 2;
            let $item = getGridItem(row, mCol);

            if (boardFlipped()) {
                hRow = (thisPlayer === "B") ? 2 : 5;
            }

            highlights.push([hRow, mCol]);
            attacks.push([row, mCol]);
        }
    }

    return attacks;
}

function enPassantMove(prevPlayer) {
    if (fenStatus.enPassant) {
        if (moveList.length === 0 || (moveList.length ===1 && moveList[0].nop)) {
            let player = playerTurn();
            let row = Number(fenStatus.enPassant.substr(1));
            row = (player === "B") ? row - 1 : row + 1;
            let dst = fenStatus.enPassant.substr(0, 1) + row;
            return {dst};
        }
    }
    
    if (moveList.length > 0) {
        let move = moveList[moveList.length - 1];
        if (prevPlayer === move.player) {
            let enPassSrc = move.player === "B" ? "7" : "2";
            let enPassDst = move.player === "B" ? "5" : "4";
            if (move.piece === 'P' && enPassSrc === move.src.substr(1) && enPassDst === move.dst.substr(1)
                    && move.src.substr(0,1) === move.dst.substr(0,1)) {
                return move;
            }
        }
    }
}

function samePlayer(type1, type2) {
    return (type1 === type1.toUpperCase() && type2 === type2.toUpperCase()) || (type1 === type1.toLowerCase() && type2 === type2.toLowerCase());
}

function isWhite($img) {
    let val = $img.attr('value');
    return val === val.toLowerCase();
}

function rookValidMoves(row, col, val, highlights) {
    let all = [];
    let moves = [];
    let okLeft = true;
    let okRight = true;
    let okUp = true;
    let okDown = true;
    
    for (var i = 1; i < SIZE; i++) {
        // Left
        if (okLeft && (col - i) >= 0) {
            all.push([row, col - i]);
            if (hasPiece(row, col - i)) {
                moves.push([0, -i]);
                okLeft = false;
            }
            else {
                highlights.push([row, col - i]);
            }
        }

        // Right
        if (okRight && (col + i) < SIZE) {
            all.push([row, col + i]);
            if (hasPiece(row, col + i)) {
                moves.push([0, i]);
                okRight = false;
            }
            else {
                highlights.push([row, col + i]);
            }
        }

        // Up
        if (okUp && (row - i) >= 0) {
            all.push([row - i, col]);
            if (hasPiece(row - i, col)) {
                moves.push([-i, 0]);
                okUp = false;
            }
            else {
                highlights.push([row - i, col]);
            }
        }

        // Down
        if (okDown && (row + i) < SIZE) {
            all.push([row + i, col]);
            if (hasPiece(row + i, col)) {
                moves.push([i, 0]);
                okDown = false;
            }
            else {
                highlights.push([row + i, col]);
            }
        }
    }

    captureCheck(moves, row, col, val, highlights);

    return all;
}

function bishopValidMoves(row, col, val, highlights) {
    let all = [];
    let pieces = [];
    let okNorthEast = true;
    let okSouthEast = true;
    let okSouthWest = true;
    let okNorthWest = true;

    for (var i = 1; i < SIZE; i++) {
        // NorthEast
        if (okNorthEast && (row - i) >= 0 && (col + i) < SIZE) {
            all.push([row - i, col + i]);
            if (hasPiece(row - i, col + i)) {
                pieces.push([-i, i]);
                okNorthEast = false;
            }
            else {
                highlights.push([row - i, col + i]);
            }
        }

        // SouthEast
        if (okSouthEast && (row + i) < SIZE && (col + i) < SIZE) {
            all.push([row + i, col + i]);
            if (hasPiece(row + i, col + i)) {
                pieces.push([i, i]);
                okSouthEast = false;
            }
            else {
                highlights.push([row + i, col + i]);
            }
        }

        // SouthWest
        if (okSouthWest && (row + i) < SIZE && (col - i) >= 0) {
            all.push([row + i, col - i]);
            if (hasPiece(row + i, col - i)) {
                pieces.push([i, -i]);
                okSouthWest = false;
            }
            else {
                highlights.push([row + i, col - i]);
            }
        }

        // NorthWest
        if (okNorthWest && (row - i) >= 0 && (col - i) >= 0) {
            all.push([row - i, col - i]);
            if (hasPiece(row - i, col - i)) {
                pieces.push([-i, -i]);
                okNorthWest = false;
            }
            else {
                highlights.push([row - i, col - i]);
            }
        }
    }

    captureCheck(pieces, row, col, val, highlights);

    return all;
}

function knightValidMoves(row, col, val, highlights) {  // can have up to 8 different moves
    let moves = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
    return processValidMoves(moves, row, col, val, highlights);
}

function queenValidMoves(row, col, val, highlights) {
    let rookMoves = rookValidMoves(row, col, val, highlights);
    let bishopMoves = bishopValidMoves(row, col, val, highlights);
    return allMoves(rookMoves, bishopMoves);
}

function kingValidMoves(row, col, val, highlights, checkCastles) {
    let moves = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];

    if (checkCastles) {
        let castles = getCastles(row, col, val);
        for (let i = 0; i < castles.length; i++) {
            if ("left" === castles[i]) {
                moves.push([0, -2]);
            }
            else if ("right" === castles[i]) {
                moves.push([0, 2]);
            }
            else {
                let $img = getPiece(row, col);
                $img.attr("title", "King cannot castle it's being attacked and/or attacked in path");
            }
        }
    }

    return processValidMoves(moves, row, col, val, highlights);
}

function getPlayer(val) {
    return (val === val.toUpperCase()) ? "B" : "W";
}

function getCastles(row, col, val) {
    let piece = val.toUpperCase();
    let player = getPlayer(val);
    let sRow = (player === "B") ? 0 : 7;       // Starting row
    let sCol = 4;                              // Starting col
    let rooks = rooksNotMoved(player);
    let castles = [];

    if (boardFlipped()) {
        sRow = (player === "B") ? 7 : 0;
    }

    if (notMoved(player, piece) && row === sRow && col === sCol && rooks.length > 0) {

        for (let i = 0; i < rooks.length; i++) {
            let rook = rooks[i];
            let fCol = "left" === rook ? 1 : 6;              // first column
            let lCol = "left" === rook ? col - 1 : col + 1;  // last column
            let cols = columnsWithPiecesBetween(row, fCol, lCol);

            if (cols.length === 0) {
                let canCastle = true;
                cols = "left" === rook ? [col, col - 1, col - 2] : [col, col + 1, col + 2];

                for (let j = 0; j < cols.length; j++) {
                    if (inPath(row, cols[j], val)) {
                        canCastle = false;
                        break;
                    }
                }

                if (canCastle) {
                    castles.push(rook);
                }
                else {
                    castles.push(rook + "X");    // Cannot castle
                }
            }
        }
    }

    return castles;
}

function columnsWithPiecesBetween(row, colFrom, colTo) {
    let cols = [];
    let sCol = colFrom;
    let eCol = colTo;

    if (colFrom > colTo) {
        sCol = colTo;
        eCol = colFrom;
    }

    for (let c = sCol; c <= eCol; c++) {
        $img = getPiece(row, c);
        if ($img.length > 0) {
            cols.push(c);
        }
    }

    if (cols.length < 1) {
        for (let c = sCol; c <= eCol; c++) {
            let val = row === 0 ? "K" : "k";  // just need to distinguish between players
        }
    }

    return cols;
}

function notMoved(player, piece) {
    for (let i = 0; i < moveList.length; i++) {
        let move = moveList[i];
        if (player === move.player && piece === move.piece) {
            return false;
        }
    }

    return true;
}

function rooksNotMoved(player) {
    let list = [];
    let sides = ["left", "right"];

    if (fenStatus.castle && fenStatus.castle.length < 4
            && (moveList.length === 0 || moveList.length === 1 && moveList[0].nop)) {
        let types = ("B" === player) ? ["q","k"] : ["Q","K"];
        if (fenStatus.castle.includes(types[0])) {
            list.push(sides[0]);
        }
        if (fenStatus.castle.includes(types[1])) {
            list.push(sides[1]);
        }
        return list;
    }

    for (let side = 0; side < sides.length; side++) {
        let moved = false;
        for (let i = 0; i < moveList.length; i++) {
            let move = moveList[i];
            if (player === move.player && "R" === move.piece && sides[side] === move.rook) {
                moved = true;
                break;
            }
        }
        if (!moved) {
            list.push(sides[side]);
        }
    }

    return list;
}

function processValidMoves(moves, row, col, val, highlights) {
    let allMoves = [];
    let pMoves = [];

    for (var i = 0; i < moves.length; i++) {
        let move = moves[i];
        let mRow = row + move[0];
        let mCol = col + move[1];
        if (mRow >= 0 && mRow < SIZE && mCol >= 0 && mCol < SIZE) {
            allMoves.push([mRow, mCol]);
            if (hasPiece(mRow, mCol)) {
                pMoves.push(move);
            }
            else {
                highlights.push([mRow, mCol]);
            }
        }
    }

    captureCheck(pMoves, row, col, val, highlights);

    return allMoves;
}

function captureCheck(pieces, row, col, val, highlights) {
    for (var i = 0; i < pieces.length; i++) {
        let mRow = row + pieces[i][0];
        let mCol = col + pieces[i][1];
        if (mRow >= 0 && mRow < SIZE && mCol >= 0 && mCol < SIZE && hasPiece(mRow, mCol)) {
            let $img = getPiece(mRow, mCol);
            let cVal = $img.attr('value');
            if (!samePlayer(val, cVal)) {
                highlights.push([mRow, mCol]);
            }
        }
    }
}

function getGridItem(row, col) {
    let $items = $(".grid-item");
    let index = row * SIZE + col;
    return $($items[index]);
}

function highlightCell(row, col) {
    let $item = getGridItem(row, col);
    $item.addClass('highlight');
    showInfo(row, col);
}

function showInfo(row, col, types) {
    let $item = getInfoItem(row, col);

    if (!types) {
        types = ["B", "T", "W"];
    }

    for (let i = 0; i < types.length; i++) {
        $item.find(".info" + types[i]).addClass('showInfo');
    }
}

function hasPiece(row, col) {
    let $img = getPiece(row, col);

    return $img.length > 0;
}

function getPiece(row, col) {
    let $item = getGridItem(row, col);

    return $item.find('img');
}

function clearValidMoves() {
    $(".grid-item").removeClass('highlight hover hoverNoDrop');
    $(".info span").removeClass('showInfo');
    $(".holder img").removeClass("allowMove");
}

function getSuggestedFilename() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}-${hours}-${minutes}-${seconds}` + ".chs";
}

function isDroppable($this, $img) {
    let id = $this.attr('id');

    if ($this.hasClass('grid-item')) {
        if (onlyValidMoves()) {
            return isValidMove($img, $this);
        }
        else {
            return $this.is(':empty') || isValidMove($img, $this);
        }
    }
    else if ($this[0].id === $img.parent()[0].id) {
        return false;
    }
    else if ($this.hasClass('discardPile')) {
        if (onlyValidMoves()) {
            return false;
        }
        else if ('discardWhite' === id && isWhite($img)) {
            return true;
        }
        else if ('discardBlack' === id && !isWhite($img)) {
            return true;
        }
    }
}

function isValidMove($img, $dst) {
    let side = isWhite($img) ? "W" : "B";

    if (side !== playerTurn()) {
        return false;  // not your turn!
    }

    let val = $img.attr("value");
    let pos = toRowCol($img.parent());
    let highlights = showValidMoves(pos[0], pos[1], val);
    pos = toRowCol($dst);

    for (let i = 0; i < highlights.length; i++) {
        let cell = highlights[i];

        if (cell[0] === pos[0] && cell[1] === pos[1]) {
            return true;
        }
    }

    return false;
}

// Get row, col from $item attributes
function toRowCol($item) {
    let row = Number($item.attr("row"));
    let col = Number($item.attr("col"));
    return ([row, col]);
}

// Convert position, such as c7, to internal row,col, such as 1,2
function posRowCol(pos) {
    if (pos.startsWith('discard')) {
        return [0, 0];
    }
    let num = Number(pos.substr(1));
    let row = boardFlipped() ? num - 1 : SIZE - num;
    let col = pos.charCodeAt(0) - 'a'.charCodeAt(0);
    return ([row, col]);
}

// Converts interal row/col to external form, such as c7
function toLocation(row, col) {
    let file = String.fromCharCode('a'.charCodeAt(0) + col);   // file means column in chess notation
    let rank = boardFlipped() ? row + 1 : SIZE - row;          // rank means row in chess notation
    return file + rank;
}

function getLocation($holder) {
    if ($holder.hasClass('discardPile')) {
        return $holder[0].id;   // discardBlack or discardWhite
    }
    let num = Number($holder.attr("row"));
    let rank = boardFlipped() ? num + 1 : SIZE - num;          // rank means row in chess notation
    let idx = Number($holder.attr("col"));
    let file = String.fromCharCode('a'.charCodeAt(0) + idx);   // file means column in chess notation

    return file + rank;
}

function dropAction($this, $img) {
    let color = isWhite($img) ? "White" : "Black";
    let player = isWhite($img) ? "W" : "B";
    let val = $img.attr('value');
    let piece = val.toUpperCase();
    let src = getLocation($img.parent());
    let dst = getLocation($this);
    let pSrc = posRowCol(src);
    let pDst = posRowCol(dst);
    let castles = getCastles(pSrc[0], pSrc[1], val);
    let move = {player, piece, src, dst};

    // handle capture
    let $gImg = $this.find("img");
    if (!$this.hasClass("discardPile")) {
        let gVal = $gImg.attr("value");
        let prevPlayer = (player === "B") ? "W" : "B";
        if ("P" === piece && enPassantMove(prevPlayer) && pSrc[1] !== pDst[1] && $gImg.length == 0) {   // Check for en Passant capture
            $gImg = getPiece(pSrc[0], pDst[1]);
            gVal = $gImg.attr("value");
        }
        if (gVal && !samePlayer(val, gVal) && $gImg.length > 0) {
            let id = "discard" + (isWhite($img) ? "Black" : "White");
            move.capture = gVal;
            move.capturePos = getLocation($gImg.parent());
            $("#" + id).append($gImg);   // move to discard
        }
    }

    $this.append($img);
    $img.css({top: '0px',left: '0px',position: 'relative'});
    $this.removeClass('active');
    clearValidMoves();

    // Remember initial rook move
    if (piece === "R") {
        let iSrc = (player === "B") ? ["a8","h8"] : ["a1","h1"];
        if (iSrc[0] === src) {
            move.rook = "left";
        }
        else if (iSrc[1] === src) {
            move.rook = "right";
        }
    }
    else if (piece === "K" && castles.length > 0) {
        let delta = pDst[1] - pSrc[1];
        let $rook;
        let $holder;

        if (delta === -2 && castles.includes("left")) {
            $rook = getPiece(pSrc[0], 0);
            $holder = getGridItem(pSrc[0], 3);
            move.rook = "left";
        }
        else if (delta === 2 && castles.includes("right")) {
            $rook = getPiece(pSrc[0], 7);
            $holder = getGridItem(pSrc[0], 5);
            move.rook = "right";
        }
        if (move.rook) {              // complete castle by moving rook
            move.castle = move.rook;
            $holder.append($rook);
        }
    }

    handleValidMove(move, $img);
}

function handleValidMove(move, $img) {
    if (onlyValidMoves()) {
        let promote;

        handleCheckAndMate(move);

        if ("P" === move.piece) {
            let rank = move.dst.substr(1);
            if ("W" === move.player && "8" === rank) {
                promote = promoteWhite;
            }
            else if ("B" === move.player && "1" === rank) {
                promote = promoteBlack;
            }
        }

        if (promote) {
            promoteDialog(promote, move, $img);
        }
        else {
            movingPiece(move);
            sendMove(move);
        }
    }
    else {
        sendMove(move);
    }
}

function sendMove(move) {
    if (session.handle) {
        let payload = JSON.stringify(move);
        fbSendPeer(TYPE_MOVE, session.handle, payload);
    }
}

function movingPiece(move) {
    moveList.push(move);
    tableMsg(move);
    moveRedo.length = 0;   // Clear redo list, since piece was moved
    updateButtonState();
}

function promoteDialog(html, move, $img) {
    let $promote = $(PROMOTE);

    $promote.parent().find('.ui-dialog-titlebar-close').hide();
    $promote.html(html);
    $(PROMOTE + " img").click(function() {
        let $this = $(this);
        let src = $this.attr("src");
        let val = $this.attr("value");
        $img.attr("src", src);
        $img.attr("value", val);
        move.promote = val;
        $(PROMOTE).dialog("close");
        handleCheckAndMate(move);
        movingPiece(move);
        sendMove(move);
    });
    $promote.dialog("open");
}

function handleCheckAndMate(move) {
    let kings = "B" === move.player ? ["k", "K"] : ["K", "k"];  // Their king then mine

    cellInfoUpdate();

    if (isKingCheck(kings[0])) {
        let player = (kings[0] === kings[0].toUpperCase()) ? "B" : "W";
        if (playerCanMove(player)) {
            move.check = true;
        }
        else {
            move.win = move.player;
        }
    }    

    if (!(move.check || move.win)) {
        if (isKingCheck(kings[1])) {        // check my king in check
            if (playerCanMove(move.player)) {
                move.check = true;
            }
            else {
                move.win = move.player;
            }
        }
    }
}

function initDragDrop() {
    $('.holder img').draggable({
        zIndex: 1000,      // Set zIndex high to bring it to the top
        revert: function(droppableContainer) {
            if (!droppableContainer || !droppableContainer.hasClass('ui-droppable') || $(droppableContainer).is(':not(:empty)')) {
                if (droppableContainer) {
                    let $img = droppableContainer.find("img");
                    overPiece($img);
                }
                return true; // Revert to the original position
            }
            else {
                return false; // Allow drop
            }
        },

        start: function(event, ui) {
            $(this).css('z-index', 1000); // Ensure it's on top when dragging starts
        },
        stop: function(event, ui) {
            $(this).css('z-index', ''); // Reset z-index when dragging stops
        }
    });

    // Make the drop area droppable
    $('.holder').droppable({
        accept: 'img', // Only accept the image
        over: function(event, ui) {
            let $this = $(this);
            if (isDroppable($this, ui.draggable)) {
                $this.addClass('active');
            }
        },

        // Handle when the draggable leaves the droppable area
        out: function(event, ui) {
            // Remove 'active' class when the draggable leaves
            $(this).removeClass('active');
        },

        drop: function(event, ui) {
            // Actions when image is dropped
            let $this = $(this);
            if (isDroppable($this, ui.draggable)) {
                dropAction($this, ui.draggable);
            }
            else {
                $this.removeClass('ui-droppable');
            }
        }
    });
}

function initDialogs() {
    $(INFO).html(infoContent);
    $(INFO).dialog({
        title: "Chess Trainer information",
        autoOpen: false, // Keep it hidden initially
        width: 800,
        height: 720,
        modal: true, // Makes the dialog modal (disables interaction with background content)
        position: { my: "center", at: "center", of: "body" } // Center the dialog in <body>
    });

    $(PROMOTE).dialog({
        title: "Promote Pawn",
        autoOpen: false, // Keep it hidden initially
        width: 446,
        height: 164,
        modal: true, // Makes the dialog modal (disables interaction with background content)
        position: { my: "center", at: "center", of: "body" } // Center the dialog in <body>
    });
}

function info() {
    $(INFO).dialog("open");
}