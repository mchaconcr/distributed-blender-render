const { remote } = require('electron');
const { dialog } = require('electron').remote;
const config = require('electron-json-config');
const WebSocketClient = require('websocket').client;
const os=require('os');
const client = new WebSocketClient();
const fs = require('fs-extra');
const shell = require('shelljs');
const chunks=require('buffer-chunks');

var servers=config.get("servers",[]);
var retryIn=0;

var isRendering=false;

if(!fs.existsSync(os.homedir()+"/blender-render/")){
	fs.ensureDirSync(os.homedir()+"/blender-render/");
}

function pad(num, size) {
    var s = num+"";
    while (s.length < size) s = "0" + s;
    return s;
}

$('#changeBlenderPath').on('click',function(){
	dialog.showOpenDialog(remote.getCurrentWindow(),{title:"Blender.app Location", properties: ['openFile'] ,filters:[{name:"Blender",extensions:[".app"]}]}).then(result=>{
		if (fs.existsSync(result.filePaths[0]+'/Contents/MacOS/blender')) {
			$('#blenderPath').text(result.filePaths[0]+'/Contents/MacOS/blender');
			config.set('blenderPath',result.filePaths[0]+'/Contents/MacOS/blender');
			checkStatus();
		}else{
			dialog.showErrorBox("No Blender Executables found.", "Select your Blender.app Version 2.81 and above.")
		}
	}).catch(err=>{console.log(err)});
})

if(config.has('blenderPath')){
	$('#blenderPath').text(config.get('blenderPath'));
}

function changeServer(){
	$('#retry').text("");
	if(config.has('server')){
		if(conn!=null)conn.drop(1000);
		var svr=config.get("server");
		$('#mainServer').text(svr.ip+":"+svr.port);
		client.abort();
		client.connect("ws://"+svr.ip+":"+svr.port+"/","blender-render-protocol",os.hostname(),null,null);
		$('#serviceLed').removeClass(["on","off","error"]).addClass("connecting");
	}else{
		$('#mainServer').text("");
	}
}
var svr=config.get("server",{ip:"",port:""});
$('#useIp').val(svr.ip);$('#usePort').val(svr.port);
changeServer();

var retryTimeOut=0;
function retryCount(){
	clearTimeout(retryTimeOut);
	console.log("Retry:",retryIn);
	retryIn--;
	if(retryIn>0){
		$('#retry').text(" [Retrying in: "+retryIn+" seconds.]");
		retryTimeOut=setTimeout(retryCount, 1000);
	}else{
		changeServer();
	}
}

function startRetry(){
	retryIn=3;
	retryCount();
}

function sendOb(ob,status){
	$('#status').text(status);
	conn.sendUTF(JSON.stringify(ob));
}

function checkStatus(){
	if((isRendering==false)&&($('#blenderPath').text()!="")&&(conn!=null)){
		sendOb({"type":"imFree"},"Requesting Frame");
		return;
	}
	if(($('#blenderPath').text()=="")){
		$('#blenderAppHeader').css('background',"#A00");
 	}else{
 		$('#blenderAppHeader').css('background',"");
	}
	console.log('Status:OK')
}
checkStatus();

var fileChunks={file:"",chunks:[]};

function sendFile(fPath,task,frame){
	var strm=fs.readFileSync(fPath);
	if(fileChunks.file!=fPath){
		fileChunks.file=fPath;
		fileChunks.chunks=chunks( strm ,conn.config.fragmentationThreshold)
	}
	sendOb({"type":"fileSend","chunks":fileChunks.chunks.length,"task":task,"frame":frame},"Sending Image");
}

function parseFrame(f,data,frameNum){
	if(f.indexOf("Tiles")>0){
		var tiles=f.toString().split(" | ").pop().split(" ");
		tiles=tiles[1].split("/");
		$('#FraX').text(tiles[0]);
		$('#FraOf').text(tiles[1]);
	}
	if(f.indexOf("Time:")>0){
		$('#FraTime').text(f.substr(f.indexOf('Time:')+5, 8));
	}
	if(f.indexOf("Remaining:")>0){
		$('#FraRem').text(f.substr(f.indexOf('Remaining:')+10, 8));
	}
	if(f.indexOf("Saved:")>-1){
		sendFile(f.split(": ").pop().replace(/\'/g,""),data.task,frameNum);
	}
}

var file="",chunk=0,taskID="",nChunks=0,wstream,fileSimple,isIdle;
function parse(msg,origin,conn){
	switch(msg.type){
		case "render":
			fileSimple=msg.data.file;
			file=os.homedir()+"/blender-render/"+msg.data.path+"/"+msg.data.file;
			if(!fs.existsSync(file)){
				console.log("I don't have the anim",file);
				chunk=0;taskID=msg.data.task;
				sendOb({"type":"getBlenderFile","task":taskID},"Get Blender File");
			}else{
 				var rPath=os.homedir()+"/blender-render/"+msg.data.path;
				if(fs.existsSync(rPath + "/renders/"+ pad(msg.data.frame, 4) +".png")){
					console.log("Got that file!");
					sendFile(rPath + "/renders/"+ pad(msg.data.frame, 4) +".png",msg.data.task,msg.data.frame);
				}else{
					$('#status').html("Rendering <b>"+(msg.data.path+"/"+msg.data.file)+"</b> Frame: <b>" + msg.data.frame + "</b>" );
	 				var exec=$('#blenderPath').text() + ' -b ' + (rPath+"/"+msg.data.file) + " -o " + rPath + "/renders/#### -F PNG -f " + msg.data.frame;
	
					console.log("Ready to render",exec);
	 				shell.config.execPath = shell.which('node').toString()			
					var child = shell.exec(exec, {async:true});
					child.stdout.on('data', function(data) {
					  data.split("\n").forEach(function(a){
						  parseFrame(a,msg.data,msg.data.frame);
					  });
					});
					
				}
			}
			break;
		case "getImageChunk":
			if(msg.chunk>=fileChunks.chunks.length){
				fileChunks={file:"",chunks:[]};
				sendOb({"type":"ImageDone","task":taskID},"Image Sent");
			}else{
				conn.sendBytes(fileChunks.chunks[msg.chunk]);
			}
			break;
		case "fileSend":
			nChunks=msg.chunks;
			sendOb({"type":"getBlenderChunk","task":taskID,"chunk":0},"Get blender file "+fileSimple+" ("+Math.round((chunk*100)/nChunks)+"%)");
			fs.ensureFileSync(file);
			wstream = fs.createWriteStream(file);
			break;
		case "fileSent":
			wstream.end;
			sendOb({"type":"imFree"},"Requesting Frame");
			break;
		case "idle":
			$('#status').text("No jobs yet.");
			isIdle==true;
			break;
		case "RequestIfFree":
			if(isIdle===true){
				sendOb({"type":"imFree"},"Requesting Frame");
			}
			break;

		default:
			console.log(msg);
	}
}

var conn=null;

client.on('connectFailed', function(error) {
	console.log('conn Failed',error);
	$('#serviceLed').removeClass(["on","off","connecting"]).addClass("error");
	startRetry();
});

client.on('connect', function(connection) {
	conn=connection;
	$('#retry').text("");
	clearTimeout(retryTimeOut);
	$('#serviceLed').removeClass(["error","off","connecting"]).addClass("on");
	checkStatus();
    connection.on('error', function(error) {
	    console.log('error');
    	conn=null;
		$('#serviceLed').removeClass(["on","off","connecting"]).addClass("error");
		startRetry();
    });
    connection.on('close', function(reasonCode, description) {
	    console.log('close',reasonCode, description);
    	conn=null;
		$('#serviceLed').removeClass(["on","error","connecting"]).addClass("off");
		startRetry();
    });

    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            parse(JSON.parse(message.utf8Data),connection.remoteAddress,connection);
        } else if (message.type === 'binary') {
       	    chunk++;
       	    sendOb({"type":"getBlenderChunk","task":taskID,"chunk":chunk},"Getting blender file "+fileSimple+" ("+Math.round((chunk*100)/nChunks)+"%)");
       	    wstream.write(message.binaryData);
        }

    });
    
});

 
function useServer(ip,port){
	config.set("server",{ip:ip,port:port});
	$('#useIp').val(ip);$('#usePort').val(port);
	changeServer();
} 

$('#connManual').on('click',function(){
	useServer($('#useIp').val(),$('#usePort').val());
	$('#serverPick').removeClass('isOn');
});
/////////DISCOVERY
var Discovery = require('udp-discovery').Discovery;
var discover = new Discovery();
 
discover.on('available', function(name, data, reason) {
	var serv=$("<div id='"+name+"'>"+data.data.hostname+" ["+data.addr+":"+data.data.port+"]</div>");
	var servAdd=$("<button data-ip='"+data.data.hostname+"' data-port='"+data.data.port+"'>Connect</button>");
	servAdd.on("click",function(){
		useServer($(this).data("ip"),$(this).data("port"));
		$('#serverPick').removeClass('isOn');
	});
	serv.append(servAdd);
	$('#autoServer').append(serv);
});
 
discover.on('unavailable', function(name, data, reason) {
	$('#'+name).remove();
});


$('#chooseServer').on('click',function(){$('#serverPick').toggleClass('isOn')});
$('#closeServerPick').on('click',function(){$('#serverPick').removeClass('isOn');});

$('#donate').on('click',function(){require("electron").shell.openExternal("https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=PB3H5X9JQAS5W&item_name=If+you+find+this+useful+consider+donating&currency_code=USD&source=url");});
$('#git').on('click',function(){require("electron").shell.openExternal("https://github.com/mchaconcr/distributed-blender-render");});
