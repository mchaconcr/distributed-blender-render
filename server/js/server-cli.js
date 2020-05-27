
const config = require('electron-json-config');
const Discovery = require('udp-discovery').Discovery;
const os=require('os');
const fs = require('fs-extra');
const { dialog } = require('electron').remote;
const { remote } = require('electron');
const { BrowserWindow } = require('electron').remote;
const { app } = require('electron').remote;
const { ipcMain } = require('electron').remote;
const {shell} = require('electron').remote;
const chunks=require('buffer-chunks');
const uniqueID="br"+(new Date).valueOf();

$('#port').on('input',function(){
	if(server.listening){
		wsServer.connections.forEach(function(conn){
			conn.close();
		})
		server.close();
	}	
});

$('b.hostName').text(os.hostname());

$('#startStopService').on('click',function(){
	if(server.listening){
		wsServer.connections.forEach(function(conn){
			conn.close();
		})
		server.close();
	}else{
		server.listen($('#port').val());
	}
});



var discover = new Discovery();

$('#network').text((Object.values(require('os').networkInterfaces()).reduce((r, list) => r.concat(list.reduce((rr, i) => rr.concat(i.family==='IPv4' && !i.internal && i.address || []), [])), [])).join("/"));

var WebSocketServer = require('websocket').server;
var http = require('http');
 
var server = http.createServer(function(request, response) {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.write('Hello there');
    response.end();
});
server.on('listening',function(){
		$('#startStopService').text('Stop')[0].disabled=false;
		$('#serviceLed').removeClass('off').addClass('on');
		$('#port').val(server.address().port);
		config.set('port',server.address().port);
		$('#port').removeClass('error');
		discover.announce(uniqueID, {port: server.address().port,hostname:os.hostname()}, 1000, true);		
});
server.on('close',function(){
		$('#startStopService').text('Start')[0].disabled=false;
		$('#serviceLed').removeClass('on').addClass('off');
		discover.pause(uniqueID);
});

server.on('error',function(e){
	console.log('socketError',e.message);
	$('#port').addClass('error');
});

server.listen(config.get("port",3030));


 
wsServer = new WebSocketServer({
    httpServer: server, autoAcceptConnections: false
});


 
function originIsAllowed(origin) {
  return true;
}

function ip2id(ip){
	return ip.replace(/[^\w]+/g, "");
}

function pad(num, size) {
    var s = num+"";
    while (s.length < size) s = "0" + s;
    return s;
}


function getFrameStatus(task){
	var frames=[];
	task.frames.forEach(function(a,b){
		frames.push([a[0],fs.existsSync(task.folder+"/"+pad(a[0],4)+".png")]);
	});
	return frames;
}

function getFileName(fullPath){
	fullPath=fullPath.split("/");
	return fullPath[fullPath.length-1];
}

function getTaskById(id){
	var tasks=config.get("tasks",[]);
	for(var t=0,u=tasks.length;t<u;t++){
		if(tasks[t].id==id)return tasks[t];
	}
}

function isBeingRendered(task,frame){
	var j=config.get('jobs');
	for(var i in j ){
		if((j[i].task==task)&&(j[i].frame==frame)){
			return i;
		}
	}
	return false;
}

function getNextFrame(requestor){
	var tasks=config.get("tasks",[]);
	if(tasks.length==0)return "idle";//If there are no tasks... -> nothing to send, let the requesting client know.
	for(var t=0,u=tasks.length;t<u;t++){ //for every task.
		tasks[t].frames=getFrameStatus(tasks[t]); //updateFrames' status.
		for(var f=0,g=tasks[t].frames.length;f<g;f++){ //for every frame on the task.
			if(tasks[t].frames[f][1]==false){ // if the status of the frame is "false" the it is not requested yet.
				var fileName=getFileName(tasks[t].file);
				config.set("jobs."+ip2id(requestor),{task:tasks[t].id,frame:f});
				var isRendered=isBeingRendered(tasks[t].id,f);
				if((isRendered==false)||(isRendered==requestor)){
					return {"file":fileName,"path":tasks[t].file.replace(fileName,"").replace(/\//g,"_"),"frame":tasks[t].frames[f][0],"task":tasks[t].id,"frame":f};
				}
			}
		}
	}
	return "idle";
}


var fileChunks={file:"",chunks:[]};
function getCurrentRender(){
	console.log('getCurrentRender');
}


var clientImages={};

function sendNextFrame(origin,conn){
	renderTasks();
	var nxtFrame=getNextFrame(origin);
	if(nxtFrame=="idle"){
		console.log(origin+" is idle.",nxtFrame);
		conn.sendUTF(JSON.stringify({"type":"idle"}));
	}else{
		console.log(origin+" is free.",nxtFrame);
		conn.sendUTF(JSON.stringify({"type":"render","data":nxtFrame}));
		$('#client_'+origin+">b").text('Rendering: '+nxtFrame.file+" (frame: "+nxtFrame.frame+")");
	}
	
}


function parse(msg,origin,conn){
	switch(msg.type){
		case "imFree":
			sendNextFrame(origin,conn);
			break;
		case "getBlenderFile":
			var task=getTaskById(msg.task);
			if(fileChunks.file!=task.file){
				fileChunks.file=task.file;
				fileChunks.chunks=chunks( fs.readFileSync(task.file) ,conn.config.fragmentationThreshold)
			}
 			//var buffer=chunks(Buffer.concat([new Buffer.from(task.file +"|||") ,fs.readFileSync(task.file)]),conn.config.fragmentationThreshold);
 			conn.sendUTF(JSON.stringify({"type":"fileSend","chunks":fileChunks.chunks.length}));
 			$('#client_'+origin+">b").text('Requesting file: '+fileChunks.file);
			break;
		case "getBlenderChunk":
			if(msg.chunk>=fileChunks.chunks.length){
				console.log('doneSending');
				conn.sendUTF(JSON.stringify({"type":"fileSent"}));
			}else{
	   			conn.sendBytes(fileChunks.chunks[msg.chunk]);
	   			$('#client_'+origin+">b").text('Sending file: '+Math.round((msg.chunk*100)/fileChunks.chunks.length)+"%");
			}
			break;
		case "fileSend":
			clientImages[origin]=msg;
			clientImages[origin].gotChunks=0;
			var tsk=getTaskById(msg.task);
			clientImages[origin].file=tsk.folder+"/"+pad(tsk.frames[msg.frame][0],4)+".png";
			clientImages[origin].folder=tsk.folder;
 			clientImages[origin].wstream = fs.createWriteStream(clientImages[origin].file+".temp");
			conn.sendUTF(JSON.stringify({"type":"getImageChunk","chunk":0}));
			$('#client_'+origin+">b").text('Sending Image: '+pad(tsk.frames[msg.frame][0],4)+".png");
			break;
		case "ImageDone":
			clientImages[origin].wstream.end;
			fs.renameSync(clientImages[origin].file+".temp",clientImages[origin].file);
			config.delete("jobs."+origin);
			delete clientImages[origin];
			sendNextFrame(origin,conn);
			renderTasks();
			break;
		default:
			console.log(msg);
	}
}

 
wsServer.on('request', function(request) {
    if (!originIsAllowed(request.origin)) {
      request.reject();
      return;
    }
    var connection = request.accept('blender-render-protocol', undefined);
    $('#clients').append("<div id='client_"+ip2id(request.remoteAddress)+"' class='connected'>"+request.origin+" <b></b></div>");
    
    connection.on('message', function(message) {
	    var orig=ip2id(connection.remoteAddress);
        if (message.type === 'utf8') {
            parse(JSON.parse(message.utf8Data),orig,connection);
        }
        else if (message.type === 'binary') {
            var climage=clientImages[ip2id(request.remoteAddress)];
            climage.wstream.write(message.binaryData);
            climage.gotChunks++;
			connection.sendUTF(JSON.stringify({"type":"getImageChunk","chunk":climage.gotChunks}));
			$('#client_'+ip2id(request.remoteAddress)+">b").text('Sending Image: '+pad(climage.frame,4)+".png ["+ Math.round((climage.gotChunks*100)/climage.chunks)  +"]%");            
        }
        
    });
    connection.on('close', function(reasonCode, description) {

		$('#clients>div#client_'+ip2id(connection.remoteAddress)).remove();
    });
});

function showTask(task){
	var lastRender=null;
	if(task!=undefined){
		task.frames.forEach(function(a){
			if(a[1]==true){
				lastRender=a;
			}
		});
	}
	if(lastRender!=null){
		$('#lastNum').text("Last rendered frame: " + lastRender[0]);
		$('#lastImage').attr('src','file://'+task.folder+"/"+pad(lastRender[0],4)+'.png');
	}
}



function renderTasks(){
	$('#taskList').empty();
	var tasks=config.get("tasks",[]);
	var currentIndex=-1;
	tasks.forEach(function(a,b){
		a.frames=getFrameStatus(a);
		var fname=a.file.split("/");
		var folName=a.folder.split("/");
		var tsk=$("<tr id='file_"+fname[fname.length-1].replace(/\./g,"_")+"' data-file='"+a.file+"'/>");
		var delTask=$("<button data-id='"+b+"'>X</button>");
		
		delTask.on("click",function(){
			var tasks=config.get("tasks",[]);
			tasks.splice( parseInt($(this).data('id')),1 );
			config.set("tasks",tasks);
			renderTasks();
		});
		var completed = 0;
		for(var i = 0,j=a.frames.length; i < j; ++i){
			if(a.frames[i][1] === true) completed++;
		}
		var ordTd=$("<td class='matIc'/>");
		var movUp=$("<button data-id='"+b+"'><span class='material-icons'>arrow_drop_up</span></button>");
		movUp.on('click',function(){
			var tasks=config.get("tasks",[]);
			var tmp=tasks[$(this).data('id')];
			tasks[$(this).data('id')]=tasks[$(this).data('id')-1];
			tasks[$(this).data('id')-1]=tmp;
			config.set("tasks",tasks);
			renderTasks();
		});
		var movDwn=$("<button data-id='"+b+"'><span class='material-icons'>arrow_drop_down</span></button>");
		movDwn.on('click',function(){
			var tasks=config.get("tasks",[]);
			var tmp=tasks[$(this).data('id')];
			tasks[$(this).data('id')]=tasks[$(this).data('id')+1];
			tasks[$(this).data('id')+1]=tmp;
			config.set("tasks",tasks);
			renderTasks();
		});
		if(b==0){movUp.attr('disabled','disabled')}
		if(b==(tasks.length-1)){movDwn.attr('disabled','disabled')}
		ordTd.append(movUp,movDwn);
		tsk.append(ordTd);
		var file=$("<td data-file='"+a.file+"'>"+fname[fname.length-1]+"</td>");
		file.on('click',function(){
 			shell.showItemInFolder($(this).data('file'));
		});
		tsk.append(file);
		var folder=$("<td data-folder='"+a.folder+"'>"+folName[folName.length-1].replace(/\./g,"_")+"</td>");
		folder.on('click',function(){
 			shell.openPath($(this).data('folder'));
		});
		tsk.append(folder);
		tsk.append("<td>"+a['from']+"</td>");
		tsk.append("<td>"+a['to']+"</td>");
		var perComp=Math.round((completed*100)/a.frames.length);
		tsk.append("<td>"+ perComp +"%</td>");
		tsk.append(delTask);
		if((perComp<100)&&(currentIndex==-1)){
			currentIndex=b;
		}
		$('#taskList').append(tsk);
	});
	showTask(tasks[currentIndex]);
}
renderTasks();

function checkRenderReady(){
	if( ($('#blenderFolder').text()!="") && ($('#blenderFile').text()!="")){
		$('#addTask')[0].disabled=false;
	}
}

$('#addFileTask').on('click',function(){
	dialog.showOpenDialog(remote.getCurrentWindow(),{title:".blend Location", properties: ['openFile'] ,filters:[{name:"Blender",extensions:[".blend"]}]}).then(result=>{
		$('#blenderFile').text(result.filePaths[0]);
		checkRenderReady();
	}).catch(err=>{console.log(err)});
});
$('#addFolderTask').on('click',function(){
	dialog.showOpenDialog(remote.getCurrentWindow(),{title:".blend Location", properties: ['openDirectory','createDirectory'] }).then(result=>{
		$('#blenderFolder').text(result.filePaths[0])
		checkRenderReady();
	}).catch(err=>{console.log(err)});
});

$('#addTask').on('click',function(){
	var tasks=config.get("tasks",[]);
	task={
		"id":"tsk"+(new Date()).valueOf(),
		"file":$('#blenderFile').text(),
		"folder":$('#blenderFolder').text(),
		"from":parseInt($('#fromTask').val()),
		"to":parseInt($('#toTask').val()),
		"order":"sequential",
		"frames":[]
	};
	for(var x=task.from,y=task.to;x<=y;x++){
		task.frames.push([x,false,{}]);
	}
	tasks.push(task);
	config.set("tasks",tasks);
	renderTasks();
	$('#createTask,#cmdAddTask').removeClass('addC');
	for(conn in wsServer.connections){
		wsServer.connections[conn].sendUTF('{"type":"RequestIfFree"}');
	}
});

$('#cmdAddTask').on('click',function(){
	$('#createTask,#cmdAddTask').toggleClass('addC');
	$('#createTask').css({top:$('#cmdAddTask')[0].getBoundingClientRect().top,left:80});
});


$('#donate').on('click',function(){require("electron").shell.openExternal("https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=PB3H5X9JQAS5W&item_name=If+you+find+this+useful+consider+donating&currency_code=USD&source=url");});
$('#git').on('click',function(){require("electron").shell.openExternal("https://github.com/mchaconcr/distributed-blender-render");});