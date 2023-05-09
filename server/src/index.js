import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { Deck } from './Deck.js';
import { randomBytes, randomUUID } from 'crypto';

const rooms = {};

const server = new WebSocketServer({
    server: createServer().listen(8000, 'localhost')
});

server.on('connection', player => {
    player.on('message', data => {
        const packet = JSON.parse(data);

        switch (packet.type) {
            /**
             * Initialize room properties
             * Initialize player properties
             * Add player to room
             * Load settings route
             */
            case 'room_create': {
                const room_id = randomBytes(3).toString('hex').toUpperCase();
                const player_id = randomUUID();

                rooms[room_id] = {
                    id: room_id,
                    deck: new Deck(),
                    settings: {},
                    black_card: '',
                    card_czar: '',
                    active_cards: [],
                    votes: [],
                    players: { [player_id]: player },
                };

                Object.entries({
                    id: player_id,
                    room: rooms[room_id],
                    white_cards: [],
                    awesome_points: 0,
                }).map(([k, v]) => player[k] = v);

                player.send(JSON.stringify({
                    type: 'route_load',
                    content: {
                        route: 'settings',
                        props: {
                            room_id: room_id,
                            languages: rooms[room_id].deck.get_languages(),
                        },
                    },
                }));
            } break;
            
            /**
             * Initialize player properties
             * Add player to room
             * Notify player that they've joined
             */
            case 'room_join': {
                const room = rooms[packet.content.room_id];
                const player_id = randomUUID();
        
                if (room) {
                    Object.entries({
                        id: player_id,
                        room: room,
                        white_cards: [],
                        awesome_points: 0,
                    }).map(([k, v]) => player[k] = v);
        
                    Object.entries({
                        [player_id]: player,
                    }).map(([k, v]) => room.players[k] = v);
        
                    player.send(JSON.stringify({
                        type: 'event_trigger',
                        content: {
                            event: 'event_joined',
                            props: {},
                        },
                    }));
                }
            } break;
            
            /**
             * Save game settings
             * Load deck based on host choice
             * Load tutorial route
             */
            case 'settings_confirm': {
                const room = player.room;

                Object.entries({
                    settings: packet.content.settings
                }).map(([k, v]) => room[k] = v);

                room.deck.load_pack(packet.content.settings.language, packet.content.settings.edition);

                for (let p of Object.values(room.players)) {
                    p.send(JSON.stringify({
                        type: 'route_load',
                        content: {
                            route: 'tutorial',
                            props: { players_total: Object.keys(room.players).length },
                        },
                    }));
                }
            } break;

            /**
             * Register player vote to start game
             * Notify players of vote count update
             * Trigger round start when all players have voted
             */
            case 'game_start_vote': {
                const room = player.room;

                room.votes.push(player.id);
        
                for (let p of Object.values(room.players)) {
                    p.send(JSON.stringify({
                        type: 'event_trigger',
                        content: {
                            event: 'event_voted',
                            props: {
                                already_voted: room.votes.includes(p.id),
                                players_voted: room.votes.length,
                                players_total: Object.keys(room.players).length,
                            },
                        },
                    }));
                }
        
                if (room.votes.length === Object.keys(room.players).length) {
                    player.emit('message', JSON.stringify({
                        type: 'round_start',
                        content: {},
                    }));
                    
                    room.votes = [];
                }
            } break;

            /**
             * Choose black card and Card Czar
             * Draw White Cards for all players
             * Load game route
             */
            case 'round_start': {
                const room = player.room;

                Object.entries({
                    black_card: room.deck.draw_black_card(),
                    card_czar: Object.keys(room.players)[Math.floor(Math.random() * Object.keys(room.players).length)],
                    active_cards: []
                }).map(([k, v]) => room[k] = v);
        
                for (let [i, p] of Object.entries(room.players)) {
                    const cards_needed = 10 - p.white_cards.length;
                    p.white_cards = [...p.white_cards, ...room.deck.draw_white_cards(cards_needed)];
        
                    p.send(JSON.stringify({
                        type: 'route_load',
                        content: {
                            route: 'game',
                            props: {
                                role: i === room.card_czar ? 'card_czar' : 'player',
                                black_card: room.black_card,
                                white_cards: i === room.card_czar ? [] : p.white_cards,
                                players_total: Object.entries(room.players).length - 1,
                                white_cards_max: (room.black_card.match(/_+/g) || [null]).length,
                            },
                        },
                    }));
                }
            } break;

            /**
             * Add chosen cards to room's active cards
             * Remove active cards form player's hand
             * If all players (excluding Card Czar) have chosen,
             * Notify Card Czar and ready players players to choose the winner
             */
            case 'white_cards_choose': {
                const room = player.room;

                room.active_cards = {
                    ...room.active_cards,
                    [player.id]: packet.content.white_cards,
                };
        
                player.white_cards = player.white_cards.filter((card) => !packet.content.white_cards.includes(card));
        
                for (let p of Object.values(room.players)) {
                    if (p.id === room.card_czar || p === player || Object.keys(room.active_cards).includes(p.id)) {
                        p.send(JSON.stringify({
                            type: 'event_trigger',
                            content: {
                                event: 'event_white_cards_chosen',
                                props: {
                                    active_cards: room.active_cards,
                                },
                            },
                        }));
                    }
                }
            } break;

            /**
             * Award winning player one Awesome Point
             * Check if deck has enough cards for another round
             * Load results or game over route
             */
            case 'round_winner_choose': {
                const room = player.room;

                room.players[packet.content.player_id].awesome_points += 1;
                const leaderboards = Object.entries(room.players)
                    .sort(([, a], [, b]) => a.awesome_points - b.awesome_points)
                    .map(([player_id,]) => player_id)
                    .reverse();
                
                const cards_needed_total = Object.values(room.players)
                    .map(p => 10 - p.white_cards.length)
                    .reduce((a, b) => a + b, 0);
                    
                if (room.deck.black_cards.length === 0 || room.deck.white_cards.length < cards_needed_total) {
                    for (let p of Object.values(room.players)) {
                        p.send(JSON.stringify({
                            type: 'route_load',
                            content: {
                                route: 'gameover',
                                props: {
                                    awesome_points: p.awesome_points,
                                    position: leaderboards.indexOf(p.id) + 1,
                                    players_total: Object.entries(room.players).length,
                                },
                            },
                        }));
                    }
                } else {
                    for (let p of Object.values(room.players)) {
                        p.send(JSON.stringify({
                            type: 'route_load',
                            content: {
                                route: 'results',
                                props: {
                                    black_card: room.black_card,
                                    white_cards: room.active_cards[packet.content.player_id],
                                    awesome_points: p.awesome_points,
                                    position: leaderboards.indexOf(p.id) + 1,
                                    players_total: Object.entries(room.players).length,
                                },
                            },
                        }));
                    }
                }
            } break;
        }
    });

    /**
     * Remove player from room
     * If room is empty, delete room
     */
    player.on('close', () => {
        const room = player.room;

        if (room) {
            delete room.players[player.id];

            if (!Object.keys(room.players).length) {
                delete rooms[room.id];
            }
        }
    });
    
    player.on('error', (event) => {
        console.log(event);
    });
});