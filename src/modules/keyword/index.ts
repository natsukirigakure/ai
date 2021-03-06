import * as loki from 'lokijs';
import 藍 from '../../ai';
import IModule from '../../module';
import config from '../../config';
import serifs from '../../serifs';
import getCollection from '../../utils/get-collection';
const MeCab = require('mecab-async');

function kanaToHira(str: string) {
	return str.replace(/[\u30a1-\u30f6]/g, match => {
		const chr = match.charCodeAt(0) - 0x60;
		return String.fromCharCode(chr);
	});
}

export default class KeywordModule implements IModule {
	public readonly name = 'keyword';

	private ai: 藍;
	private tokenizer: any;
	private learnedKeywords: loki.Collection<{
		keyword: string;
		learnedAt: number;
	}>;

	public install = (ai: 藍) => {
		this.ai = ai;

		//#region Init DB
		this.learnedKeywords = getCollection(this.ai.db, '_keyword_learnedKeywords', {
			indices: ['userId']
		});
		//#endregion

		this.tokenizer = new MeCab();
		this.tokenizer.command = config.mecab;

		setInterval(this.say, 1000 * 60 * 60);
	}

	private say = async () => {
		const tl = await this.ai.api('notes/local-timeline', {
			limit: 30
		});

		const interestedNotes = tl.filter(note => note.userId !== this.ai.account.id && note.text != null);

		let keywords: string[][] = [];

		await Promise.all(interestedNotes.map(note => new Promise((res, rej) => {
			this.tokenizer.parse(note.text, (err, tokens) => {
				const keywordsInThisNote = tokens.filter(token => token[2] == '固有名詞' && token[8] != null);
				keywords = keywords.concat(keywordsInThisNote);
				res();
			});
		})));

		const rnd = Math.floor((1 - Math.sqrt(Math.random())) * keywords.length);
		const keyword = keywords.sort((a, b) => a[0].length < b[0].length ? 1 : -1)[rnd];

		const exist = this.learnedKeywords.findOne({
			keyword: keyword[0]
		});

		let text: string;

		if (exist) {
			text = serifs.keyword.remembered(keyword[0]);
		} else {
			this.learnedKeywords.insertOne({
				keyword: keyword[0],
				learnedAt: Date.now()
			});

			text = serifs.keyword.learned(keyword[0], kanaToHira(keyword[8]));
		}

		this.ai.post({
			text: text
		});
	}
}
