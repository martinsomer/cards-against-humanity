import fs from 'fs';

export class Deck {
    get_languages() {
        const languages = {};

        for (let file of fs.readdirSync('../cards')) {
            const [language, edition, color] = file.split('_');

            if (!languages[language]) {
                languages[language] = [ edition ];
            } else {
                if (!languages[language].includes(edition)) {
                    languages[language].push(edition);
                }
            }
        }

        Object.entries(languages).forEach(([language, editions]) => {
            languages[language] = editions.length;
        });
        
        return languages;
    }

    load_pack(language, edition) {
        this.black_cards = fs.readFileSync(`../cards/${language}_${edition}_black.txt`, 'utf-8').split('\n');
        this.white_cards = fs.readFileSync(`../cards/${language}_${edition}_white.txt`, 'utf-8').split('\n');

        this.shuffle_cards(this.black_cards);
        this.shuffle_cards(this.white_cards);
    }

    shuffle_cards(cards) {
        for (let [i] of cards.entries()) {
            const j = Math.floor(Math.random() * cards.length);
            [cards[i], cards[j]] = [cards[j], cards[i]];
        }
    }

    draw_white_cards(max) {
        if (!max) return [];
        
        const remaining = Math.min(this.white_cards.length, max);
        return this.white_cards.splice(remaining * -1);
    }

    draw_black_card() {
        return this.black_cards.pop();
    }
}