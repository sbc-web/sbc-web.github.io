import { DurableObject } from "cloudflare:workers";

export default {
	async fetch(request, env, ctx) {
		if (request.url.endsWith("/replicator")) {
			// Expect to receive a WebSocket Upgrade request.
			// If there is one, accept the request and return a WebSocket Response.
			const upgradeHeader = request.headers.get('Upgrade');
			if (!upgradeHeader || upgradeHeader !== 'websocket') {
			  	return new Response('Durable Object expected Upgrade: websocket', { status: 426 });
			}
	  
			// This example will refer to the same Durable Object,
			// since the name "foo" is hardcoded.
			let id = env.server.idFromName("foo");
			let stub = env.server.get(id);
	  
			return stub.fetch(request);
		}
	  
		return new Response(null, {
			status: 400,
			statusText: 'Bad Request',
			headers: {
				'Content-Type': 'text/plain',
			},
		});
	}
};

export class Replicator extends DurableObject {
	currentId;
	state;
	env;

	constructor(state, env) {
		super(state, env);
		this.state = state;
		this.env = env;
		this.currentId = 0;
	}

	async fetch(request) {
		// Creates two ends of a WebSocket connection.
		const webSocketPair = new WebSocketPair();
		const [client, server] = Object.values(webSocketPair);

		this.handleWebsSocket(server, this.currentId);
	
		return new Response(null, {
		  status: 101,
		  webSocket: client,
		});
	}

	async handleWebSocket(websocket, id) {
		// Calling `accept()` tells the runtime that this WebSocket is to begin terminating
		// request within the Durable Object. It has the effect of "accepting" the connection,
		// and allowing the WebSocket to send and receive messages.
		this.state.acceptWebSocket(websocket, [ id ]);
		this.currentId += 1;
	
		// Upon receiving a message from the client, the server replies with the same message,
		// and the total number of connections with the "[Durable Object]: " prefix
		websocket.addEventListener('message', (event) => {
			for (let ws of this.state.getWebSockets()) {
				if (ws === websocket) {
					continue;
				}
				ws.send(event);
			}
		});
	
		// If the client closes the connection, the runtime will close the connection too.
		websocket.addEventListener('close', (cls) => {
		  	websocket.close(cls.code, "Durable Object is closing WebSocket");
		});
	}
}
