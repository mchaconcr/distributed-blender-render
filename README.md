# Node-Electron distributed blender rendering.
to install:
Download the repository and using terminal in the repository's folder:
`npm install`
To run the UI from the command line (dev mode):
`npm start`
To generate the bin executables (Mac):
`npm build`
###### Contributors for Linux and Windows very welcome! :) 

The server & client use Network Discovery [[udp-discovery](http://https://www.npmjs.com/package/udp-discovery "udp-discovery")] to announce the service availability on the local network.
## Server Instructions

Create a rendering task by clicking on the "+" button next to the Render Tasks and pick a blender file (Normally .blend extension) on the machine running the server, then choose a rendering location (folder), this is where the server will put the received images from the clients. Then select which frames are going to be render.

Once the server is installed, and at least 1 rendering task is defined, just select a port and start the service. using the "start" button.

## Client instructions
First define your Blender.app location by clicking on the "Change" button inside the "Blender Path tab.
then click the "+" next to "Rendering server", here you can input the server URL and port of the server, or pick it from the auto-discovered servers from the network.
Connect... and happy rendering!

### Protocol definition:
The server-client configuration uses websockets [[websocket](http://https://www.npmjs.com/package/websocket "websocket")] to comunicate.
When a client connects and notifies it is available for rendering the server sends a request to render the next frame of the first unfinished render job from the jobs list. The client checks if the .blend file exists in it's local cache: (~/blender-render/[task_full_path]/[blend_file]). If it doesn't, then it requests the file from the server. After the client gets the file, it will again request the next available frame (in the transfer process another machine might have rendered the former last frame). Now, with the blend file, it renders the given frame and once it finishes up it sends the image back to the server to be saved at the render folder.
The server keeps track of requested jobs to avoid double-assigning the same frame to different machines. Also, if the client goes offline and the server requests a frame already rendered on the client, no double-render is performed, instead, the images are transfered.

### Collaboration
Please feel free to collaborate in this project. I see several ways to improve it. (Is Electron necessary?)

## Rendering for production
I'm not responsible for the results of this experimental software. Use it on your own risk. It mostly works for me, but don't use it for production/critical renders.

### Donations
Please feel free to donate ([Paypal](http://https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=PB3H5X9JQAS5W&item_name=If+you+find+this+software+useful+consider+donating,+if+not,+consider+collaborating+to+it+on+Github.+Thanks%21&currency_code=USD&source=url "Paypal")) if you find this project useful. If not, please feel free to collaborate or give feedback. Thanks!