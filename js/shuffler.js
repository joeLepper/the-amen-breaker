try{//checks that the JS engine works with our code (namely webkit's Audio API), and if not suggests downloading a browser that will
	
	//based on YUI / Crockford, to escape the global namespace
	var namespace = function(namespaceString) {
		var parts = namespaceString.split('.'),
			parent = window,
			currentPart = '';    
	
		for(var i = 0, length = parts.length; i < length; i++) {
			currentPart = parts[i];
			parent[currentPart] = parent[currentPart] || {};
			parent = parent[currentPart];
		}
	
		return parent;
	}
	//instantiate a namespace
	var shuffler = namespace('Shuffler');

	//handle the AJAX upload of an MP3
	shuffler.uploader = (function(){
		console.log("***************************************************************");
		
		
		//////////////////////
		//private properties//
		//////////////////////
		
		//instance of the upload form
		var _bufferArray = [],
		    _control = document.getElementById("your-files"),   //ref to DOM upload form
			_defaultRequest = new XMLHttpRequest(),             //used to fetch the default sound
			_files,                                             //used to hold the user's upload
			
			//iterators
			_i = 0,
			_j = 0,
			
			//used to determine the length of _files
			//right now this should only ever equal 0 or 1
			//eventually the breaker will support more than one file
			//being played / uploaded
			_len = 0,
			
			//turns file into arrayBuffer                                          
			_reader = new FileReader(),
			
			
			///////////////////
			//private methods//
			///////////////////
			
			//called when the upload is to start
			_goUpload = function(){
			  
			  _files = _control.files;                  //point to the file
			  _len = _files.length;                     //how many files are we talking about?
			  
			  //prepare file for upload to server
			  for ( ; _i < _len; _i++) {
				_reader.readAsArrayBuffer(_files[_i]);  //turn the files into array buffers
			  }
			},
			
			//called to handle the return from the server
			_onLoadEnd = function(e){
			  
			  //pass the audio data to the audio graph
			  //then callback to create the buffer
			  Shuffler.audioGraph.context.decodeAudioData(e.target.result, function(_buffer) {
				  
				  Shuffler.audioGraph.setBuffer(_buffer);             //set the buffer to be played
				  Shuffler.audioGraph.setBufferCache(_buffer);        //cache the audio data so that it can be reloaded as necessary
				  Shuffler.waveForm.generateWaveForm(_files[0]);      //pass the data forward, toward the server, to draw the wave
				  _j++;
				  
			  }, 
			  
			  function(){console.log("Wrong file type")}); //error
			};

		
		////////////////
		//run on load //
		////////////////
		
		_control.addEventListener("change", _goUpload);               //listen for upload
		_reader.addEventListener("loadend", _onLoadEnd);              //listen for completion
		
		//fetch the default sound
		_defaultRequest.open('GET','audio/amen_equaliza.mp3',true);
		_defaultRequest.responseType = 'arraybuffer';
		
		//upon fetching, setup the audio graph
		_defaultRequest.onload = function(){
			Shuffler.audioGraph.context.decodeAudioData(_defaultRequest.response, function(buffer){
				Shuffler.audioGraph.setBuffer(buffer);                 //set initial sound
				Shuffler.audioGraph.setBufferCache(buffer);            //cache the sound
				Shuffler.audioGraph.initGrainStart()                   //init the jumpPoints
				Shuffler.audioGraph.initGrainDuration();               //init the loop-back point
				Shuffler.waveForm.attachMouseActions();                //turn on the listeners
				Shuffler.waveForm.initImgHolderWidth();                //check the screen width

				//console.log('default loaded');
			},function(){console.log('error')})
		}
		
		//FIRE!
		_defaultRequest.send();
		
		/////////////////////
		//public interface //
		/////////////////////
		
		return{
			buffer:_bufferArray[0]
		}	
	}());
	
	//handles all live sound
	shuffler.audioGraph = (function(){
		
		
		//////////////////////
		//private properties//
		//////////////////////
		
		
		var _bufferCache,                                    //cache of current sound for easy retrieval
		    _context = new webkitAudioContext(),             //holds the audio graph
			_source = _context.createBufferSource(),         //where our sound will originate from
			_grainDuration,                                  //length of the sound to loop through
			_grainEnd,                                       //value used to tell the audio when to loop
			_grainStart = [],                                //array that holds all of the "jumpPoint" values 
			_isPlaying = false,                              //flag to determine the function of the play / pause button
			
			
			///////////////////
			//private methods//
			///////////////////
			
			//for retrieving the buffer
			_getBufferCache = function(){
				return _bufferCache;	
			},
			
			//retrieves the current time (in seconds)
			//this is relative to the time that the 
			//context was created
			_getCurrentTime = function(){
				return _context.currentTime;
			},
			
			//retrieves the total length of the currently loaded sound
			_getSoundDuration = function(){
				return _source.buffer.duration;	
			},
			
			//determines the total length of the currently loaded sound
			_initGrainDuration = function(){
				_grainDuration = _source.buffer.duration;
				_initGrainEnd();
			},
			
			//sets the initial end of the loop to the end of the sound
			_initGrainEnd = function(){
				_grainEnd = _source.buffer.duration;

			},
			
			//calls to create the initial grainStart array
			//which are all values between 0-1 
			_initGrainStart = function(){
				_setGrainStart(0,1);
			},
			
			//called by the play / pause button
			_playPause = function(){

				if(!_isPlaying){                           //we're paused
					_playSound(0);                         //start from the beginning of the grain
					_isPlaying = true;                     
				}
				else{                                      //we're playing
					_resetSound(0);                        //call stop
					Shuffler.scrubber.resetScrub(8);       //send the scrubber back
					_isPlaying = false;                    
				}
			},
			
			//play it
			_playSound = function(index){
				_isPlaying = true;                        //set the flag to true so that pause will work
				
				//calculate the length to play of the current loop
				//this changes depending on where in the sample the
				//user has decided to start
				_grainDuration = _grainEnd - _grainStart[index];
				
				//possibly deprecated check to make sure that grainDuration is a positive value 
				if(_grainDuration < 0){_grainDuration = _grainStart[index] - _grainEnd}; 
				
				
				Shuffler.scrubber.resetScrub(index);                                           //send the scrubber back to the jumpPoint indicated by the user
				Shuffler.scrubber.scrub(Shuffler.waveForm.getImgHolderWidth(),_grainDuration); //make the scrubber move in time with the audio
				Shuffler.scheduler.setNextLoop(_grainDuration);                                //set the time of the next iteration of the loop
				
				//is this the first time play has been called?
				//if so, start checking the schedule
				if(!Shuffler.scheduler.getTimerRunning()){
					Shuffler.scheduler.startTimer();
				}
				
				//kill the currently playing sound
				//so we don't end up with a million loops
				_source.noteOff(0);
				
				//instantiate the buffer
				//Web Audio API requires this prior to every play
				_source = _context.createBufferSource();    //create a source
				_setBuffer(_bufferCache);                   //fetch the sound
				_source.connect(_context.destination);      //connect to the speakers
				
				//play it!
				//hack here (-.08 seconds) to keep the audio in time with the visual jump points
				_source.noteGrainOn(0,_grainStart[index] - .08,_grainDuration);
				
			},
			
			//kill it
			_resetSound = function(){
				_source.noteOff(0);                     //stop the sound
				Shuffler.scheduler.clearTimer();        //turn off the clock
			},
			
			//set the current instance of the buffer 
			_setBuffer = function(_sound){
				_source.buffer = _sound;
			},
			
			//cache the buffer upon load
			_setBufferCache = function(_sound){
				_bufferCache = _sound;	
			},
			
			//sets the user-defined grainEnd
			_setGrainEnd = function(_setValue){
				_grainEnd = _setValue * _source.buffer.duration    //set value is a value from 0-1
			},
			
			//sets the initial grainStart array with 9 equidistant points when the user defines a loop
			//setStart is a value between 0-1 that is less than setEnd which is no greater than 1.
			_setGrainStart = function(_setStart,_setEnd){
				var _i = 0,
					myGrainDuration = _setEnd - _setStart;
					
				for(_i; _i < 8; _i++){
					_grainStart[_i] = ( _setStart + ( ( myGrainDuration / 8 )* _i ) ) * _source.buffer.duration;  
				}
				
			},
			
			//used to adjust the time that a jumpPoint records, when it is adjusted by the user
			_setSingleGrainStart = function(index,myGrainStart){
					_grainStart[index] = myGrainStart * _source.buffer.duration;					
			}
			
		/////////////////////
		//public interface //
		/////////////////////
			
		return{
			context:_context,
			setBuffer:_setBuffer,
			playSound:_playSound,
			setBufferCache:_setBufferCache,
			getBufferCache:_getBufferCache,
			soundDuration:_getSoundDuration,
			setGrainStart:_setGrainStart,
			setGrainEnd:_setGrainEnd,
			initGrainDuration:_initGrainDuration,
			initGrainStart:_initGrainStart,
			getCurrentTime:_getCurrentTime,
			resetSound:_resetSound,
			setSingleGrainStart:_setSingleGrainStart,
			playPause:_playPause
		}
	}());
	
	//captures all user actions
	shuffler.buttonFunctions = (function(){
		
		
		////////////////
		//DOM Controls//
		////////////////
		
		var _cancelButton       = document.getElementById("cancel"),               //clears the selection
			_instructionButton  = document.getElementById("instructions"),         //pulls out the instruction overlay
			_instructionOverlay = document.getElementById("instructionOverlay"),   //the instruction overlay
			_dismissButton      = document.getElementById("dismiss"),              //dismisses the instruction overlay
			
			
		//////////////////////
		//private properties//
		//////////////////////
			
			_instructionsOut = false,     //toggles whether the instruction overlay is displayed or not
			
			
			///////////////////
			//private methods//
			///////////////////
			
			//kills the highlight and sound, if it's playing
			_cancelHighlight = function(){
				Shuffler.waveForm.resetHighlight(); //kill drawing
				Shuffler.audioGraph.resetSound();   //kill sound
				Shuffler.scrubber.resetScrub(8);    //kill animation
			},
			
			//listens for keypresses
			_detectKeystroke = function(e){
				Shuffler.audioGraph.setBuffer(Shuffler.audioGraph.getBufferCache())
				switch(e.keyCode){
					case 81:
						//console.log("Q")
						Shuffler.audioGraph.playSound(0);
						break;
					case 87:
						//console.log("W")
						Shuffler.audioGraph.playSound(1);
						break;
					case 69:
						//console.log("E")
						Shuffler.audioGraph.playSound(2);
						break;
					case 82:
						//console.log("R")
						Shuffler.audioGraph.playSound(3);
						break;
					case 84:
						//console.log("T")
						Shuffler.audioGraph.playSound(4);
						break;
					case 89:
						//console.log("Y")
						Shuffler.audioGraph.playSound(5);
						break;
					case 85:
						//console.log("U")
						Shuffler.audioGraph.playSound(6);
						break;
					case 73:
						//console.log("I")
						Shuffler.audioGraph.playSound(7);
						break;
					case 32:
						//console.log("space bar");
						Shuffler.audioGraph.playPause();
						break;
				}
			},
			
			//passes a play call to the audioGraph
			_goPlay = function(e){
				Shuffler.audioGraph.setBuffer(Shuffler.audioGraph.getBufferCache());   //prepare the audio buffer
				Shuffler.audioGraph.playSound(e.currentTarget.buttonIndex);           //call play
			},
			
			//show / hide the instruction overlay
			_instructionCall = function(){
				if(!_instructionsOut){                                                                    //overlay is hidden
					$(".blocker").css({left:"0%"}).animate({opacity:".25"});                              //fade the interface down and block the buttons
					$("#instructionOverlay").animate({left: "25%",opacity:1},1000);                       //slide out the overlay
					_instructionsOut = true;                                                              //toggle
				}
				else{                                                                                      //overlay's visible
					$(".blocker").css({left:"-100%"}).animate({opacity:"0"},1000);                         //remove the blocker
					$("#instructionOverlay").animate({opacity:0},1000).animate({left: "-530px"},1000);     //remove the overlay
					_instructionsOut = false;                                                              //toggle
				}
			}
		
		
		////////////////
		//run on load //
		////////////////
			
		//attach the listeners	
		_cancelButton.addEventListener("click",_cancelHighlight);
		_instructionButton.addEventListener("click",_instructionCall);
		_dismissButton.addEventListener("click",_instructionCall);
		window.addEventListener("keydown",_detectKeystroke);
		
		return true;
	}());
	
	//handles the visual of any user-uploaded files
	//handles the drawing / manipulation of the highlight / jumpPoints
	shuffler.waveForm = (function(){

			
		/////////////////
		//DOM ELEMENTS //
		/////////////////
			
		var _highlight = document.getElementById("highlight"),
		    _imgHolder = document.getElementById("waveHolder"),
			_verticalLine0 = document.getElementById("verticalLine0"),
			_verticalLine1 = document.getElementById("verticalLine1"),
			_verticalLine2 = document.getElementById("verticalLine2"),
			_verticalLine3 = document.getElementById("verticalLine3"),
			_verticalLine4 = document.getElementById("verticalLine4"),
			_verticalLine5 = document.getElementById("verticalLine5"),
			_verticalLine6 = document.getElementById("verticalLine6"),
			_verticalLine7 = document.getElementById("verticalLine7"),
			_verticalLine8 = document.getElementById("verticalLine8"),
			
			
		//////////////////////
		//private properties//
		//////////////////////
		
			_cursorPoint,                                     //might duplicate _highlightCurrentPoint
		    _file,                                            //file to pass to the server
			_form = new FormData(),                           //form to be passed to server
			_highlightCurrentPoint,                           //where the mouse is during the highlight drawing
			_highlightSegment,                                //deprecated?********************************************************************************************************
			_highlightStartPoint,                             //where the user started drawing the highlight
			_highlightWidth,                                  //holds the width of the highlight in pixels
			_imgHolderHeight = _imgHolder.style.height,       //total height of the waveHolder
			_imgHolderWidth,                                  //total length of the waveHolder
			_indexToMove,                                     //index of jumpPoint being adjusted
			
			_jumpPoints = [_verticalLine0,                    //array of DOM elements that make up the jumpPoints
						   _verticalLine1,
						   _verticalLine2,
						   _verticalLine3,
						   _verticalLine4,
						   _verticalLine5,
						   _verticalLine6,
						   _verticalLine7,
						   _verticalLine8],
			
			//array holding values from 0-1 detailing 
			//where along the sound each jumpPoint is			   
			_jumpPointsNormalized = [],                       
			
			_xhr = new XMLHttpRequest,                        //to be passed to the server
			
			
			///////////////////
			//private methods//
			///////////////////
			
			//add initial mouse listeners
			_attachMouseActions = function(){
				_imgHolder.addEventListener("mousedown", _waveFormMouseDown);             //starting to draw highlight
			},
			
			//pass the audio data to the server to have the wave drawn
			_generateWaveForm = function(_file){
				
				//create the form data
				_form.append('file',_file);                      //mp3 to be sent to the server for drawing
				_form.append('height',300);                      //height of image to be returned
				_form.append('width',window.innerWidth - 20);    //width of image to be returned
				_form.append('foreground','#FFFF51');            //color of image to be returned
				_form.append('background','');                   //background (left empty for transparent BG)
				_form.append('flat',true);                       //setting flat to true
				
				//pass it on
				$.ajax({
					url: "php/php-waveform-png_3.php",
					type: "POST",
					data: _form,
					processData: false,
					contentType: false,
					success: function(_result){_gotTheWaveForm(_result)}
				});
			},
			
			//return the height of the image holder as a number, not a string
			_getImgHolderHeight = function(){
				return parseInt(_imgHolder.style.height);	
			},
			
			//return the width of the image holder as a string
			_getImgHolderWidth = function(){
				return _imgHolderWidth	
			},
			
			//return the location of the left edge of a jumpPoint
			_getJumpPoint = function(index){
				return _jumpPoints[index].style.left;
			}, 
			
			//place the wave image
			_gotTheWaveForm = function(_response){
				
				//match the image holder to the width of the window
				_imgHolderWidth = window.innerWidth -20 + "px";
				
				
				//setup the mouse listeners
				_attachMouseActions();
				_imgHolder.draggable = false;                                   //cancel weird mouse interactions / native browser highlight
				_imgHolder.style.width = _imgHolderWidth;                       //set the imgHolder width
				_imgHolder.style.backgroundImage = "url(" + _response + ")";    //place the image
				
				//prepare the loops
				Shuffler.audioGraph.initGrainStart();                          //setup the initial loop starts (jumpPoints)                         
				Shuffler.audioGraph.initGrainDuration();                       //setup the initial loop length
				
				//make the cursor indicate that the waveForm can be selected
				_highlight.style.cursor = "text";
				_imgHolder.style.cursor = "text";
			},
			
			//invoked while the learner is drawing the highlight
			_highlightMouseMove = function(e){
				
				_highlightCurrentPoint = e.pageX;                                                  //update where the mouse is
				_highlightWidth = (_highlightCurrentPoint - _highlightStartPoint) + 1;             //calculate width

				//calculate segment width
				_highlightSegment = _highlightWidth / 8; 
				
				//user drew left
				if(_highlightWidth < 0){
					_highlight.style.left  = _highlightStartPoint + _highlightWidth  + "px";                     //move the left edge of the highlight with the mouse
					_highlight.style.width = (_highlightWidth * -1) + "px";                                      //update the width of the highlight
					_verticalLine8.style.left = _cursorPoint;                                                    //set the last line in _jumpPoints to where the user started drawing
					
					//set the rest of the lines to their respective points
					_verticalLine1.style.left = ( _highlightCurrentPoint - _highlightSegment ) + "px";           
					_verticalLine2.style.left = ( _highlightCurrentPoint - _highlightSegment * 2) + "px";
					_verticalLine3.style.left = ( _highlightCurrentPoint - _highlightSegment * 3) + "px";
					_verticalLine4.style.left = ( _highlightCurrentPoint - _highlightSegment * 4) + "px";
					_verticalLine5.style.left = ( _highlightCurrentPoint - _highlightSegment * 5) + "px";
					_verticalLine6.style.left = ( _highlightCurrentPoint - _highlightSegment * 6) + "px";
					_verticalLine7.style.left = ( _highlightCurrentPoint - _highlightSegment * 7) + "px";
					
					//line0 stays with the cursor
					_verticalLine0.style.left = _highlightCurrentPoint + "px";

				}
				
				//user drew right
				else{
					_highlight.style.width = _highlightWidth + "px";                                           //update highlight width as we draw
					_highlight.style.left  = _highlightStartPoint + "px";                                      //keep the highlight's left alignment with the user's initial click
					_verticalLine0.style.left = _cursorPoint;                                                  //line0 stays where the user initially clicked
					
					//set the rest of the lines to their respective points
					_verticalLine7.style.left = ( _highlightCurrentPoint - _highlightSegment ) + "px";
					_verticalLine6.style.left = ( _highlightCurrentPoint - _highlightSegment * 2) + "px";
					_verticalLine5.style.left = ( _highlightCurrentPoint - _highlightSegment * 3) + "px";
					_verticalLine4.style.left = ( _highlightCurrentPoint - _highlightSegment * 4) + "px";
					_verticalLine3.style.left = ( _highlightCurrentPoint - _highlightSegment * 5) + "px";
					_verticalLine2.style.left = ( _highlightCurrentPoint - _highlightSegment * 6) + "px";
					_verticalLine1.style.left = ( _highlightCurrentPoint - _highlightSegment * 7) + "px";
					
					//line8 stays with the cursor
					_verticalLine8.style.left = _highlightCurrentPoint + "px";
				}
				
				//update the stored position of the jumpPoints
				for(var i = 0; i < _jumpPoints.length; i++){
					_setJumpPointPosition(i);
				}
				
			},
			
			//user's done drawing
			_highlightMouseUp = function(e){
				_measureIt();
				
				//stop listening for mousemove
				_highlight.removeEventListener("mousemove", _highlightMouseMove);
				_imgHolder.removeEventListener("mousemove", _highlightMouseMove);
				_verticalLine0.removeEventListener("mousemove", _highlightMouseMove);
				_verticalLine1.removeEventListener("mousemove", _highlightMouseMove);
				
				//don't listen for mouseup either
				_highlight.removeEventListener("mouseup", _highlightMouseUp);
				_imgHolder.removeEventListener("mouseup", _highlightMouseUp);
				_verticalLine0.removeEventListener("mouseup", _highlightMouseUp);
				_verticalLine1.removeEventListener("mouseup", _highlightMouseUp);

				//don't listen for mousedown
				_imgHolder.removeEventListener("mousedown", _waveFormMouseDown);
				_verticalLine0.removeEventListener("mousedown", _waveFormMouseDown);
				_verticalLine1.removeEventListener("mousedown", _waveFormMouseDown);
				_highlight.removeEventListener("mousedown", _waveFormMouseDown);
				
				//do listen for mousedown on the jumpPoints
				for(var i = 0; i < _jumpPoints.length; i++){
					_jumpPoints[i].addEventListener("mousedown", _jumpPointAdjust);
				};
				
				//change the cursor back to the default on the imgHolder
				_highlight.style.cursor = "default";
				_imgHolder.style.cursor = "default";
			},
			
			//set the imgHolder width relative to the window
			_initImgHolderWidth = function(){
				_imgHolderWidth = window.innerWidth -20 + "px";
			},
			
			//let the user start adjusting individual jumpPoints
			_jumpPointAdjust = function(e){
				_indexToMove = e.currentTarget.jumpIndex                               //point to the index of the moving jumpPoint 
				e.currentTarget.addEventListener("mousemove",_jumpPointAdjustment);    //listen to mousemove on this line
				_imgHolder.addEventListener("mousemove",_jumpPointAdjustment);         //listen to mousemove on the imgholder
				_highlight.addEventListener("mousemove",_jumpPointAdjustment);         //listen to mousemove on the highlight
			},
			_jumpPointAdjusted = function(){
				
				//stop listening to mousemove
				_imgHolder.removeEventListener("mousemove",_jumpPointAdjustment);
				_highlight.removeEventListener("mousemove",_jumpPointAdjustment);
				_jumpPoints[_indexToMove].removeEventListener("mousemove",_jumpPointAdjustment);
				
				//stop listening to mouseup
				_imgHolder.removeEventListener("mouseup",_jumpPointAdjusted);
				_highlight.removeEventListener("mouseup",_jumpPointAdjusted);
				_jumpPoints[_indexToMove].removeEventListener("mouseup",_jumpPointAdjusted);
				
				
				//if dragging line 8 adjust the grainEnd
				if(_indexToMove === 8){
					Shuffler.audioGraph.setGrainEnd((parseInt(_jumpPoints[8].style.left) / parseInt(_imgHolderWidth)));         
				}
				
				//otherwise just adjust the grainStart
				else{
					Shuffler.audioGraph.setSingleGrainStart(_indexToMove, (parseInt(_jumpPoints[_indexToMove].style.left) / parseInt(_imgHolderWidth)));	
				}
				
				//set the normalized position of the jumpPoint the user moved
				_setJumpPointPosition(_indexToMove);
			},
			
			//called during mousemove while the jumpPoint's being adjusted
			_jumpPointAdjustment = function(e){
				
				var myPosition = e.pageX + "px";     //local var pointing to the mouse position
				
				//listen for mouseup
				_imgHolder.addEventListener("mouseup",_jumpPointAdjusted);
				_highlight.addEventListener("mouseup",_jumpPointAdjusted);
				_jumpPoints[_indexToMove].addEventListener("mouseup",_jumpPointAdjusted);
				
				
				if(_jumpPoints[_indexToMove + 1] && _jumpPoints[_indexToMove - 1]){                         //we're not moving line0 or line8

					if( !(parseInt(myPosition) <= parseInt(_jumpPoints[_indexToMove + 1].style.left) && 
						  parseInt(myPosition) >= parseInt(_jumpPoints[_indexToMove - 1].style.left))){
						
						//do nothing because the user is 
						//trying to drag one jumpPoint past another
						
					}
					else{
						
						_jumpPoints[_indexToMove].style.left= e.pageX + "px";   //move the jumpPoint with the cursor
						
					};
				}
				else if(_jumpPoints[_indexToMove - 1]){                                                    //we're moving line8

					if(parseInt(myPosition) <= parseInt(_jumpPoints[_indexToMove - 1].style.left)){
						//do nothing because the user is 
						//trying to drag one jumpPoint past another
						
					}
					else{
						
						_jumpPoints[_indexToMove].style.left= e.pageX + "px";   //move the jumpPoint with the cursor
						_highlight.style.width = (parseInt(myPosition) - parseInt(_jumpPoints[0].style.left)) + "px";
					}
				}
				else if(_jumpPoints[_indexToMove + 1]){                                                     //we're moving line0
					if(parseInt(myPosition) >= parseInt(_jumpPoints[_indexToMove + 1].style.left)){
						
						//do nothing because the user is 
						//trying to drag one jumpPoint past another
						
					}
					else{
						
						_jumpPoints[_indexToMove].style.left= e.pageX + "px";   //move the jumpPoint with the cursor
						_highlight.style.left = myPosition;
						_highlight.style.width = (parseInt(_jumpPoints[8].style.left) - parseInt(myPosition)) + "px";
					};
				};
			},
			
			//determine when the audio grain starts and stop
			_measureIt = function(){
				var myGrainStart,
					myGrainEnd;
				
				//user dragged right
				if(_highlightStartPoint < _highlightCurrentPoint){
					myGrainStart = _highlightStartPoint / parseInt(_imgHolderWidth);
					myGrainEnd   = _highlightCurrentPoint / parseInt(_imgHolderWidth);
				}
				
				//user dragged left
				else{
					myGrainStart = _highlightCurrentPoint / parseInt(_imgHolderWidth);
					myGrainEnd   = _highlightStartPoint / parseInt(_imgHolderWidth);
				}
				
				//pass this into the audio graph
				Shuffler.audioGraph.setGrainStart(myGrainStart,myGrainEnd);
				Shuffler.audioGraph.setGrainEnd(myGrainEnd,myGrainStart);
			},
			
			//kill the highlight
			_resetHighlight = function(){
				
				//reset the jumpPoints
				for(var i = 0; i < _jumpPoints.length; i++){
					_jumpPoints[i].style.left = "0px";	
					_jumpPoints[i].removeEventListener("mousedown", _jumpPointAdjust);  //stop listening for adjusting jumpPoints
				}
				
				//reset the highlight DOM element
				_highlight.style.left = "0px";
				_highlight.style.width = "1px";
				
				//reset the mouse listeners
				_attachMouseActions();
				
				//reset the cursor
				_highlight.style.cursor = "text";
				_imgHolder.style.cursor = "text";
				
			},
			
			
			/*resizeCancelButton = function(){                               //deprecated
				var myCancelButton = document.getElementById("cancel");
			},*/
			
			//called when the user is resizing the window to adjust the highlight
			_resizeHighlight = function(){
				
				for(var i = 0; i < _jumpPoints.length; i++){
					_jumpPoints[i].style.left = (_jumpPointsNormalized[i] * parseInt(_imgHolderWidth)) + "px";                  //move the jumpPoints in sync with the imgHolder
/************************	CURRENTLY NOT WORKING    **********************************************************************************************************************************/				
					_jumpPoints[i].style.height = _imgHolder.style.height;                                                      //adjust the height of the imgHolder
				}
				highlight.style.left = _jumpPoints[0].style.left;                                                               //adjust the highlight to align with line0
				highlight.style.width = (parseInt(_jumpPoints[8].style.left) - parseInt(_jumpPoints[0].style.left)) + "px";     //adjust the highlight width
				
/************************	CURRENTLY NOT WORKING    **********************************************************************************************************************************/				
				highlight.style.height = _imgHolder.style.height;                                                               //adjust the highlight height to the imgHolder height
					
			},
			
			//called when the user is resizing the window to adjust the imgHolder
			_resizeWaveArea = function(){
				
				//update the width to the window
				_imgHolderWidth = window.innerWidth -20 + "px";
				_imgHolder.style.width = _imgHolderWidth;
				
/************************	CURRENTLY NOT WORKING    **********************************************************************************************************************************/
				_imgHolder.style.height = (_imgHolderHeight * parseInt(window.innerHeight)) + "px";                     //update the height
				_resizeHighlight();                                                                                     //call to resize the highlight
				Shuffler.scrubber.resizeScrubber(_imgHolder.style.height);                                              //call to resize the scrubber
			},
			
			_setImgHolderHeight = function(myHeight){
				//set heights
				_highlight.style.height = myHeight + "px";
				//_imgHolder.style.height = "px";
				
				//init imgHolder height value
				_imgHolderHeight = myHeight / parseInt(window.innerHeight);
				//console.log("height: " + myHeight);
			},
			
			//generate the "normalized" coordinates of the jumpPoints from 0-1
			_setJumpPointPosition = function(myIndex){
					_jumpPointsNormalized[myIndex] = parseInt(_jumpPoints[myIndex].style.left) / parseInt(_imgHolderWidth);
			},
			
			//called on page load if the page is too short, reduces the height of the highlight and jumpPoints to the value passed in
			_shortenHighlight = function(myHeight){
				for (var i = 0; i < _jumpPoints.length; i++){
					_jumpPoints[i].style.height = (myHeight) + "px";
				}
				_highlight.style.height = (myHeight + 15) + "px";
			},
			
			//user's starting to drag
			_waveFormMouseDown = function(e){
				
				_highlightStartPoint = e.pageX;    //this is where the highlight starts
				
				//add mousemove listeners
				_highlight.addEventListener("mousemove", _highlightMouseMove);
				_imgHolder.addEventListener("mousemove", _highlightMouseMove);
				_verticalLine0.addEventListener("mousemove", _highlightMouseMove);
				_verticalLine1.addEventListener("mousemove", _highlightMouseMove);
				
				//add mouseup listeners
				_highlight.addEventListener("mouseup", _highlightMouseUp);
				_imgHolder.addEventListener("mouseup", _highlightMouseUp);
				_verticalLine0.addEventListener("mouseup", _highlightMouseUp);
				_verticalLine8.addEventListener("mouseup", _highlightMouseUp);
				
				//init the current cursorPoint
				_cursorPoint = e.pageX + "px";
				
				//begin drawing the highlight
				_highlight.style.left = _highlightStartPoint + "px";
				_highlight.style.width = "0px";
				_verticalLine1.style.left = e.pageX + "px";
			}
			
			
		////////////////
		//run on load //
		////////////////
			
			//set jumpIndex
			for(var j = 0; j < _jumpPoints.length; j++){
				_jumpPoints[j].jumpIndex = j;	
			}
			//_setImgHolderHeight();
			
			
			
		/////////////////////
		//public interface //
		/////////////////////
			
		return{
			generateWaveForm:_generateWaveForm,
			getImgHolderWidth:_getImgHolderWidth,
			getJumpPoint:_getJumpPoint,
			resetHighlight:_resetHighlight,
			resizeWaveArea:_resizeWaveArea,
			attachMouseActions:_attachMouseActions,
			initImgHolderWidth:_initImgHolderWidth,
			getImgHolderHeight:_getImgHolderHeight,
			shortenHighlight:_shortenHighlight,
			setImgHolderHeight:_setImgHolderHeight
		}	
	}());
	
	//the clock
	shuffler.scheduler = (function(){
		
		
		//////////////////////
		//private properties//
		//////////////////////
		
		var _nextLoop,
			_timerRunning = false,
			

			///////////////////
			//private methods//
			///////////////////
			
			_checkSchedule = function(){
				//console.log("current time: " + Shuffler.audioGraph.getCurrentTime());
				//console.log("nextTime: " + _nextLoop);
				if( _nextLoop <= Shuffler.audioGraph.getCurrentTime() && _timerRunning === true){
					//console.log("true")
					_clearTimer();
					_timerRunning = false;
					Shuffler.audioGraph.playSound(0);
				}
				else{
					//console.log("false");
					_timer("Shuffler.scheduler.checkSchedule()");
				}
			},
			_clearTimer = function(){
				_timerRunning = false;
				clearTimeout(_timer);	
			},
			_getTimerRunning = function(){
				return _timerRunning;	
			},
			_setNextLoop = function(_setValue){
				
				_nextLoop = Shuffler.audioGraph.getCurrentTime() + _setValue;
			},
			_startTimer = function(){
				_timerRunning = true;
				_timer("Shuffler.scheduler.checkSchedule()");
					
			},
			_timer = function(func){
				_innerTimer = setTimeout(func, 3)
			}
			
			
		/////////////////////
		//public interface //
		/////////////////////
			
		return{
			setNextLoop:_setNextLoop,
			startTimer:_startTimer,
			checkSchedule:_checkSchedule,
			getTimerRunning:_getTimerRunning,
			clearTimer:_clearTimer
		}	
	})();
	
	//handles the scrubber bar animations
	shuffler.scrubber = (function(){
		
		
		/////////////////
		//DOM ELEMENTS //
		/////////////////
		
		var _bar = document.getElementById("scrubberBar"),  //this is the scrubber bar
			
			
			///////////////////
			//private methods//
			///////////////////
			
			//literally re-set, make it jump
			_resetScrub = function(index){

				if(Shuffler.waveForm.getJumpPoint(0) === ""){                                                        //no jumpPoints have been defined by the user, hide the srubber
					$(_bar).stop(true,true).animate({"left":-25},1,"linear");
				}
				else{                                                                                                //jump to the jumpPoint defined by the user
					$(_bar).stop(true,true).animate({"left":Shuffler.waveForm.getJumpPoint(index)},1,"linear");
				}
			},
			
			//the user's window was too small on load, shrink the scrubber to match
			_resizeScrubber = function(myHeight){
				//console.log(myHeight);
				_bar.style.height = myHeight;
				//console.log(_bar.style.height);		
			},
			
			//animate the scrubber
			_scrub = function(index,duration){

				if(Shuffler.waveForm.getJumpPoint(8) === "0px" || Shuffler.waveForm.getJumpPoint(8) === ""){               //the user has either not set, or reset the highlight
					$(_bar).animate({"left":parseInt(Shuffler.waveForm.getImgHolderWidth())},duration * 1000,"linear");    //animate all the way across the waveForm
				}
				else{                                                                                                      //the highlight has been set
					$(_bar).animate({"left":parseInt(Shuffler.waveForm.getJumpPoint(8))},duration * 1000,"linear");        //animate between the defined limits
				}
			},
			
/******************KNOWN ISSUE - the scrubber doesn't stay in the proper position relative to the waveForm on window resize*****************************************************/
			_repositionScrubber = function(){
				/*var myPosition = _bar.style.left;
				console.log(myPosition)
				//_resetScrub();
				$(_bar).css({"left":(parseInt(myPosition)/parseInt(Shuffler.waveForm.getImgHolderWidth()))})
					   .animate({"left":parseInt(Shuffler.waveForm.getImgHolderWidth())},duration * 1000,"linear");*/
			}
			
			
		/////////////////////
		//public interface //
		/////////////////////
			
		return{
			scrub:_scrub,
			resetScrub:_resetScrub,
			resizeScrubber:_resizeScrubber,
			repositionScrubber:_repositionScrubber
		}	
	}());
	shuffler.windowFunction = (function(){
			

		///////////////////
		//private methods//
		///////////////////
		
		//function to find the position of an element on page, 
		//borrowed from http://www.quirksmode.org/js/findpos.html
		//great site full of lots of helpful JS information
		var _getTruePosition = function(obj){ 
				var curleft = curtop = 0;
				if (obj.offsetParent) {
					do{
						curleft += obj.offsetLeft;
						curtop += obj.offsetTop;	
					}while (obj = obj.offsetParent);
				};
				return curtop;
			},
			
			//check if the window is too small for our default layout
			_initScreenSize = function(){
				
				//console.log("screenSize")
				if(parseInt(window.innerHeight) <= 560 && parseInt(window.innerHeight) > 400 ){ //yep, too small

					document.getElementById("waveHolder").style.height = "200px";               //make the imgHolder 200px
					Shuffler.waveForm.shortenHighlight(200);                                    //make the highlight 200px
					Shuffler.scrubber.resizeScrubber("200px");                                      //make the scrubber 200px
					Shuffler.waveForm.setImgHolderHeight(200)
				}
				else if(parseInt(window.innerHeight) <= 400){                                   //waaaaay too small
					
					document.getElementById("waveHolder").style.height = "150px";              //make the imgHolder 150px
					Shuffler.waveForm.shortenHighlight(150);                                   //same with the highligh
					Shuffler.scrubber.resizeScrubber("150px");                                     //and the scrubber
					Shuffler.waveForm.setImgHolderHeight(150)
					
				}
				else if (parseInt(window.innerHeight) > 560 && parseInt(window.innerHeight) <= 650 ){ //it's just right
					//console.log("just right: " + (window.innerHeight))
					Shuffler.waveForm.setImgHolderHeight(300)
				}
				else if(parseInt(window.innerHeight) > 650 && parseInt(window.innerHeight) <= 750 ){ //it's a little big
				
					//console.log("bigger: " + (window.innerHeight))
					document.getElementById("waveHolder").style.height = "450px";              //make the imgHolder 150px
					Shuffler.waveForm.shortenHighlight(450);                                   //same with the highligh
					Shuffler.scrubber.resizeScrubber("450px");                                     //and the scrubber
					Shuffler.waveForm.setImgHolderHeight(450)
				}
				else{
					//console.log("biggest: " + (window.innerHeight))
					document.getElementById("waveHolder").style.height = "550px";              //make the imgHolder 150px
					Shuffler.waveForm.shortenHighlight(550);                                   //same with the highligh
					Shuffler.scrubber.resizeScrubber("550px");                                     //and the scrubber
					Shuffler.waveForm.setImgHolderHeight(550)
				}
				_resizeChooseButton();
				
			},
			
			//hack to position our faked file input button and get it to line up with its compatriots
			_resizeChooseButton = function(){
				document.getElementById("fileButton").style.top = (_getTruePosition(document.getElementById("cancel")) - 4) + "px";
			}
			
			//the user's dragging the window
			_resizeScreen = function(){
				Shuffler.waveForm.resizeWaveArea();
				Shuffler.scrubber.repositionScrubber();
				_resizeChooseButton();
			}


		////////////////
		//run on load //
		////////////////
			
		window.onresize = _resizeScreen;
		window.onload = _initScreenSize;
		return true;	
	}());
}
catch(e){                                                                    //THIS ISN'T A MODERN BROWSER!
	$(".blocker").css({left:"0%"}).animate({opacity:".25"});                 //slide the blocker out
	$("#modernBrowserOverlay").animate({left: "25%",opacity:1},1000);        //slide the overlay out
}
