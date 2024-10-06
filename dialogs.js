const infoContent = `
<p>
<b>Purpose:</b>
To provide a way for a chess novice to learn the basics of how to analyze positions by providing information about pieces that are hovered over. By observing this information, novice players can learn to think more like advanced players think. 

<b>Information provided:</b>
Light green highlight: the hover piece.
Light blue highlight: legal squares that the hover piece may move to.

<b>Text in squares identify pieces using standard chess notation:</b>
  K=King, Q=Queen, R=Rook, B=Bishop, N=Knight, and P=Pawn.

<b>Light text in highlighted squares:</b>
- For white hover pieces these are the defenders of the square.
- For black hover pieces these are the attackers of the square.

<b>Dark text in highlighted squares:</b>
- For black hover pieces these are the defenders of the square.
- For white hover pieces these are the attackers of the square.

<b>Red text:</b> pieces that are attacked if the hover piece moves to the highlighted square. 

<b>Buttons at the top from left to right:</b>
- Save (in non-standard ‘chs’ format)
- Open (supporting chs, FEN, and PGN formats)
- Info shows this information
- Rewind undo back to start
- Back undo move
- Forward next move
- Fast forward applies all moves until the end
- Legal-moves only button; when disabled, pieces may be placed anywhere
</p>
`;

const promoteWhite = `
<img src="icons/white Q.png" value="q">
<img src="icons/white R.png" value="r">
<img src="icons/white B.png" value="b">
<img src="icons/white N.png" value="n">
`;

const promoteBlack = `
<img src="icons/black Q.png" value="Q">
<img src="icons/black R.png" value="R">
<img src="icons/black B.png" value="B">
<img src="icons/black N.png" value="N">
`;