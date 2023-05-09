async function route_load(route, props = null) {
    window.props = props || undefined;

    await fetch(`./views/${route}.html`)
        .then(async response => await response.text() )
        .then(async content => await $('body').html(content));
}

window.socket = new WebSocket('ws://localhost:8000');

window.socket.addEventListener('open', () => {
    route_load('connect');
    
    window.socket.addEventListener('message', async ({ data }) => {
        const packet = JSON.parse(data);

        switch (packet.type) {
            /**
             * Load route and attach props object to window
             */
            case 'route_load': {
                const { route, props } = packet.content;
                await route_load(route, props);
            } break;

            /**
             * Trigger event inside loaded view
             */
            case 'event_trigger': {
                const { event, props } = packet.content;
                window[event].apply(null, [ props ]);
            } break;
        }
    });
});

window.socket.addEventListener('error', () => route_load('error'));
