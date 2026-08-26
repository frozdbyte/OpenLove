#!/usr/bin/env node
/**
 * Interactive Dev Console for OpenLove Push Notifications & Milestone Testing.
 *
 * Runs in a separate terminal during development or staging. Connects directly
 * to SQLite (data/openlove.db) and VAPID keys (data/vapid.json) to inspect
 * subscriptions, trigger background cron checks, or dispatch targeted test
 * milestones for specific bonds.
 */

import Database from 'better-sqlite3';
import webPush from 'web-push';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DATABASE_URL
	? process.env.DATABASE_URL.replace(/^file:/, '')
	: path.resolve(process.cwd(), 'data/openlove.db');

const VAPID_PATH = path.resolve(process.cwd(), 'data/vapid.json');
const FALLBACK_VAPID_SUBJECT = 'https://github.com/frozdbyte/OpenLove';

// Colors for terminal output
const cyan = (t) => `\x1b[36m${t}\x1b[0m`;
const green = (t) => `\x1b[32m${t}\x1b[0m`;
const yellow = (t) => `\x1b[33m${t}\x1b[0m`;
const red = (t) => `\x1b[31m${t}\x1b[0m`;
const magenta = (t) => `\x1b[35m${t}\x1b[0m`;
const bold = (t) => `\x1b[1m${t}\x1b[0m`;
const dim = (t) => `\x1b[2m${t}\x1b[0m`;

function clearScreen() {
	output.write('\x1b[2J\x1b[0f');
}

function initDb() {
	if (!fs.existsSync(DB_PATH)) {
		console.log(yellow(`⚠️  Database file not found at ${DB_PATH}. Creating directory...`));
		fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
	}
	const db = new Database(DB_PATH);
	db.pragma('journal_mode = WAL');
	return db;
}

function initVapid() {
	let vapidKeys = null;
	if (process.env.PUBLIC_VAPID_KEY && process.env.PRIVATE_VAPID_KEY) {
		vapidKeys = {
			publicKey: process.env.PUBLIC_VAPID_KEY.trim(),
			privateKey: process.env.PRIVATE_VAPID_KEY.trim()
		};
	} else if (fs.existsSync(VAPID_PATH)) {
		try {
			vapidKeys = JSON.parse(fs.readFileSync(VAPID_PATH, 'utf-8'));
		} catch (err) {
			console.error(red(`Failed to read ${VAPID_PATH}:`), err.message);
		}
	}

	if (!vapidKeys) {
		console.log(yellow(`Generating temporary VAPID keys (or run app to create data/vapid.json)...`));
		vapidKeys = webPush.generateVAPIDKeys();
		fs.mkdirSync(path.dirname(VAPID_PATH), { recursive: true });
		fs.writeFileSync(VAPID_PATH, JSON.stringify(vapidKeys, null, 2), 'utf-8');
	}

	const subject = process.env.VAPID_SUBJECT || FALLBACK_VAPID_SUBJECT;
	webPush.setVapidDetails(subject, vapidKeys.publicKey, vapidKeys.privateKey);
	return vapidKeys;
}

async function sendNotification(sub, payload) {
	try {
		await webPush.sendNotification(
			{
				endpoint: sub.endpoint,
				keys: {
					p256dh: sub.p256dh,
					auth: sub.auth
				}
			},
			JSON.stringify(payload),
			{
				TTL: 60 * 60 * 24
			}
		);
		return { success: true };
	} catch (err) {
		return {
			success: false,
			status: err.statusCode,
			error: err.body || err.message
		};
	}
}

function getLocalDateString(timeZone, dateObj = new Date()) {
	try {
		return new Intl.DateTimeFormat('en-CA', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).format(dateObj);
	} catch {
		return dateObj.toISOString().split('T')[0];
	}
}

function calculateDueMilestones(togetherSinceStr, targetDateStr, categoriesStr = 'years,months,days_all,custom') {
	const [sYear, sMonth, sDay] = togetherSinceStr.split('-').map(Number);
	const [tYear, tMonth, tDay] = targetDateStr.split('-').map(Number);

	const startDate = new Date(sYear, sMonth - 1, sDay);
	const targetDate = new Date(tYear, tMonth - 1, tDay);

	const diffTime = targetDate.getTime() - startDate.getTime();
	const totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

	if (totalDays <= 0) return [];

	const categories = categoriesStr.split(',');
	const allowYears = categories.includes('years');
	const allowMonths = categories.includes('months');
	const allowDaysAll = categories.includes('days_all');
	const allowDaysMajor = categories.includes('days_major');

	const milestones = [];

	// 1. Year anniversaries
	if (allowYears && sMonth === tMonth && sDay === tDay && tYear > sYear) {
		const years = tYear - sYear;
		milestones.push({
			id: `years_${years}`,
			title: `${years} Year${years > 1 ? 's' : ''}`,
			type: 'years'
		});
	}

	// 2. Month milestones
	if (allowMonths && sDay === tDay) {
		let months = (tYear - sYear) * 12 + (tMonth - sMonth);
		if (months > 0) {
			const isKeyMonth =
				months <= 11 ||
				months === 18 ||
				months === 30 ||
				months === 42 ||
				months === 54 ||
				months === 66 ||
				months === 78;
			if (isKeyMonth) {
				milestones.push({
					id: `months_${months}`,
					title: `${months} Months`,
					type: 'months'
				});
			}
		}
	}

	// 3. Day milestones
	if (allowDaysAll || allowDaysMajor) {
		const allDayMilestones = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 750, 800, 900, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000];
		const majorDayMilestones = [1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000];
		const targetList = allowDaysAll ? allDayMilestones : majorDayMilestones;

		if (targetList.includes(totalDays)) {
			milestones.push({
				id: `days_${totalDays}`,
				title: `${totalDays.toLocaleString()} Days`,
				type: 'days'
			});
		}
	}

	return milestones;
}

function loadSubscriptionsWithBonds(db) {
	try {
		const subs = db.prepare(`SELECT * FROM PushSubscription`).all();
		let bonds = [];
		try {
			bonds = db.prepare(`SELECT * FROM SubscriptionBond`).all();
		} catch {
			// Table might not exist if no migration occurred yet
		}

		return subs.map((sub) => {
			const subBonds = bonds.filter((b) => b.subscriptionId === sub.id);
			return {
				...sub,
				bonds: subBonds
			};
		});
	} catch (err) {
		console.error(red('Failed to query subscriptions:'), err.message);
		return [];
	}
}

async function handleRunCron(db, simulatedDateStr = null) {
	const subs = loadSubscriptionsWithBonds(db);
	console.log(`\n${bold('🚀 Running Background Milestone Evaluation...')}`);
	console.log(`Found ${cyan(subs.length)} registered subscription(s).\n`);

	let sentCount = 0;
	let checkedCount = 0;

	for (const sub of subs) {
		const localDateStr = simulatedDateStr || getLocalDateString(sub.timezone || 'UTC');
		const bondsToCheck =
			sub.bonds.length > 0
				? sub.bonds
				: sub.togetherSince
					? [
							{
								id: 'legacy',
								bondId: 'primary_bond',
								togetherSince: sub.togetherSince,
								categories: 'years,months,days_all,custom',
								lastNotified: sub.lastNotified
							}
						]
					: [];

		for (const bond of bondsToCheck) {
			checkedCount++;
			const milestones = calculateDueMilestones(bond.togetherSince, localDateStr, bond.categories);

			if (milestones.length === 0) {
				console.log(
					`  ${dim('•')} Bond ${cyan(bond.bondId)} (Since: ${bond.togetherSince}): No milestones due on ${localDateStr}`
				);
				continue;
			}

			for (const milestone of milestones) {
				const notificationKey = `${localDateStr}:${milestone.id}`;
				if (bond.lastNotified === notificationKey) {
					console.log(
						`  ${dim('•')} Bond ${cyan(bond.bondId)}: Milestone ${yellow(milestone.title)} already notified today (${notificationKey})`
					);
					continue;
				}

				console.log(
					`  ${bold(green('⚡ Milestone Due!'))} Dispatching ${yellow(milestone.title)} to bond ${cyan(bond.bondId)}...`
				);

				const payload = {
					title: 'Milestone! ❤️',
					body: `Today is a special milestone!`,
					type: 'milestone',
					bondId: bond.bondId,
					milestoneId: milestone.id,
					milestoneTitle: milestone.title,
					milestoneType: milestone.type
				};

				const result = await sendNotification(sub, payload);

				if (result.success) {
					sentCount++;
					console.log(`    ${green('✔ Notification delivered successfully!')}`);
					if (bond.id !== 'legacy') {
						db.prepare(`UPDATE SubscriptionBond SET lastNotified = ? WHERE id = ?`).run(
							notificationKey,
							bond.id
						);
					} else {
						db.prepare(`UPDATE PushSubscription SET lastNotified = ? WHERE id = ?`).run(
							notificationKey,
							sub.id
						);
					}
				} else {
					console.log(`    ${red('✖ Delivery failed:')} ${result.error} (Status: ${result.status})`);
				}
			}
		}
	}

	console.log(`\n${bold('Summary:')} Checked ${cyan(checkedCount)} bond(s), sent ${green(sentCount)} notification(s).\n`);
}

async function handleSendGenericTest(db) {
	const subs = loadSubscriptionsWithBonds(db);
	if (subs.length === 0) {
		console.log(yellow('\nNo subscriptions found in database.\n'));
		return;
	}

	console.log(`\n${bold(`Sending Generic Connection Test Alert to ${subs.length} device(s)...`)}`);

	for (const sub of subs) {
		const payload = {
			title: 'Open Love Connected! ❤️',
			body: 'Milestone notifications are active and ready for your special days.',
			type: 'test'
		};

		const res = await sendNotification(sub, payload);
		if (res.success) {
			console.log(`  ${green('✔ Delivered to')} ${sub.endpoint.slice(0, 45)}...`);
		} else {
			console.log(`  ${red('✖ Failed for')} ${sub.endpoint.slice(0, 45)}...: ${res.error}`);
		}
	}
	console.log('');
}

async function handleBondSubmenu(rl, db, bond, sub) {
	while (true) {
		console.log(`\n${bold(magenta('── Selected Bond Details ──'))}`);
		console.log(`• Bond ID:      ${cyan(bond.bondId)}`);
		console.log(`• Together Since: ${green(bond.togetherSince)}`);
		console.log(`• Categories:   ${yellow(bond.categories || 'years,months,days_all,custom')}`);
		console.log(`• Last Notified: ${bond.lastNotified || 'none'}`);
		console.log(`• Subscription: ${dim(sub.endpoint.slice(0, 50))}...`);
		console.log(`\n${bold('Choose an action to test on this bond:')}`);
		console.log(` [1] 🎉 Send "1st Anniversary" (Years milestone)`);
		console.log(` [2] 🌿 Send "5th Year Friendship" (Years milestone)`);
		console.log(` [3] 🌟 Send "6 Months" (Months milestone)`);
		console.log(` [4] 🏆 Send "500 Days" (Days milestone)`);
		console.log(` [5] 💎 Send "1,000 Days" (Major Days milestone)`);
		console.log(` [6] ✏️  Send Custom Milestone Title`);
		console.log(` [7] 💬 Send Custom Raw Title & Body`);
		console.log(` [0] 🔙 Back to Main Menu\n`);

		const choice = (await rl.question(bold('Select an option [0-7]: '))).trim();

		if (choice === '0' || choice === '') break;

		let payload = null;

		if (choice === '1') {
			payload = {
				title: 'Milestone! ❤️',
				body: 'Today is a special milestone!',
				type: 'milestone',
				bondId: bond.bondId,
				milestoneId: 'test_1_year',
				milestoneTitle: '1st Anniversary',
				milestoneType: 'years'
			};
		} else if (choice === '2') {
			payload = {
				title: 'Milestone! 🌿',
				body: 'Today is a special milestone!',
				type: 'milestone',
				bondId: bond.bondId,
				milestoneId: 'test_5_years',
				milestoneTitle: '5 Years',
				milestoneType: 'years'
			};
		} else if (choice === '3') {
			payload = {
				title: 'Milestone! 🌟',
				body: 'Today is a special milestone!',
				type: 'milestone',
				bondId: bond.bondId,
				milestoneId: 'test_6_months',
				milestoneTitle: '6 Months',
				milestoneType: 'months'
			};
		} else if (choice === '4') {
			payload = {
				title: 'Milestone! 🏆',
				body: 'Today is a special milestone!',
				type: 'milestone',
				bondId: bond.bondId,
				milestoneId: 'test_500_days',
				milestoneTitle: '500 Days',
				milestoneType: 'days'
			};
		} else if (choice === '5') {
			payload = {
				title: 'Milestone! 💎',
				body: 'Today is a special milestone!',
				type: 'milestone',
				bondId: bond.bondId,
				milestoneId: 'test_1000_days',
				milestoneTitle: '1,000 Days',
				milestoneType: 'days'
			};
		} else if (choice === '6') {
			const title = await rl.question('Enter custom milestone title (e.g. "Moved In Together"): ');
			payload = {
				title: 'Milestone! 🎉',
				body: 'Today is a special milestone!',
				type: 'milestone',
				bondId: bond.bondId,
				milestoneId: `test_custom_${Date.now()}`,
				milestoneTitle: title.trim() || 'Special Milestone',
				milestoneType: 'custom'
			};
		} else if (choice === '7') {
			const title = await rl.question('Enter notification title: ');
			const body = await rl.question('Enter notification body: ');
			payload = {
				title: title.trim() || 'Open Love',
				body: body.trim() || 'Test message',
				type: 'test',
				bondId: bond.bondId
			};
		}

		if (payload) {
			console.log(`\nDispatching WebPush to device...`);
			const res = await sendNotification(sub, payload);
			if (res.success) {
				console.log(green(`\n✔ WebPush delivered successfully!`));
				console.log(
					dim(`  → Service Worker will wake up, match bondId "${bond.bondId}", resolve local names from IndexedDB, and render the alert.\n`)
				);
			} else {
				console.log(red(`\n✖ Delivery failed: ${res.error} (Status: ${res.status})\n`));
			}
		}
	}
}

async function handleSelectBondMenu(rl, db) {
	const subs = loadSubscriptionsWithBonds(db);
	const allBonds = [];

	for (const sub of subs) {
		if (sub.bonds && sub.bonds.length > 0) {
			for (const b of sub.bonds) {
				allBonds.push({ bond: b, sub });
			}
		} else if (sub.togetherSince) {
			allBonds.push({
				bond: {
					id: 'legacy',
					bondId: 'primary_bond',
					togetherSince: sub.togetherSince,
					categories: 'years,months,days_all,custom',
					lastNotified: sub.lastNotified
				},
				sub
			});
		}
	}

	if (allBonds.length === 0) {
		console.log(yellow('\nNo bonds found in database. Make sure you enable notifications in the app first.\n'));
		return;
	}

	while (true) {
		console.log(`\n${bold('Registered Bonds in Database:')}`);
		allBonds.forEach((item, idx) => {
			const b = item.bond;
			const s = item.sub;
			console.log(
				` [${cyan(idx + 1)}] Bond: ${bold(b.bondId)} | Since: ${green(b.togetherSince)} | TZ: ${s.timezone || 'UTC'} | Sub: ${dim(s.endpoint.slice(0, 30))}...`
			);
		});
		console.log(` [0] 🔙 Back to Main Menu\n`);

		const inputVal = (await rl.question(bold(`Select a Bond [1-${allBonds.length}] or 0: `))).trim();
		const selectedIndex = parseInt(inputVal, 10);

		if (selectedIndex === 0 || isNaN(selectedIndex)) break;

		if (selectedIndex >= 1 && selectedIndex <= allBonds.length) {
			const { bond, sub } = allBonds[selectedIndex - 1];
			await handleBondSubmenu(rl, db, bond, sub);
		}
	}
}

async function handleInspectDb(db) {
	const subs = loadSubscriptionsWithBonds(db);
	console.log(`\n${bold(cyan('══════════════ SQLite Database Inspection ══════════════'))}`);
	console.log(`Database Path: ${dim(DB_PATH)}`);
	console.log(`Total Subscriptions: ${bold(subs.length)}\n`);

	if (subs.length === 0) {
		console.log(yellow('No active subscriptions found.'));
	}

	subs.forEach((sub, i) => {
		console.log(`${bold(`Subscription #${i + 1}:`)}`);
		console.log(`  ID:              ${sub.id}`);
		console.log(`  Timezone:        ${sub.timezone || 'UTC'}`);
		console.log(`  Client Updated:  ${sub.clientUpdatedAt || 'N/A'}`);
		console.log(`  Endpoint:        ${dim(sub.endpoint)}`);
		console.log(`  Legacy Together: ${sub.togetherSince || 'None'}`);
		console.log(`  Bonds (${sub.bonds.length}):`);
		if (sub.bonds.length === 0) {
			console.log(`    ${dim('(No SubscriptionBond rows — legacy mode)')}`);
		} else {
			sub.bonds.forEach((b, j) => {
				console.log(`    [${j + 1}] Bond ID: ${cyan(b.bondId)} | Since: ${green(b.togetherSince)} | Categories: ${b.categories} | LastNotified: ${b.lastNotified || 'none'}`);
			});
		}
		console.log('');
	});
	console.log(dim('═════════════════════════════════════════════════════════\n'));
}

async function handleSimulation(rl, db) {
	const today = new Date().toISOString().split('T')[0];
	console.log(`\n${bold('Fast-Forward Date Simulation')}`);
	console.log(`Simulate milestone checks as if today was a future date (e.g. 1st anniversary, 500th day).\n`);

	const targetDate = (await rl.question(`Enter target date [YYYY-MM-DD] (default: ${today}): `)).trim() || today;
	await handleRunCron(db, targetDate);
}

async function main() {
	const db = initDb();
	const vapid = initVapid();

	const rl = readline.createInterface({ input, output });

	clearScreen();
	console.log(magenta(`
╔═══════════════════════════════════════════════════════════════╗
║               ❤️  OpenLove Push Dev Console  ❤️               ║
║       Interactive Database & WebPush Notification Tool        ║
╚═══════════════════════════════════════════════════════════════╝`));
	console.log(dim(`Connected to SQLite: ${DB_PATH}`));
	console.log(dim(`VAPID Public Key:    ${vapid.publicKey.slice(0, 30)}...\n`));

	try {
		while (true) {
			console.log(bold('Main Menu:'));
			console.log(` [1] 🚀 Run Background Cron Check (Dispatch due milestones today)`);
			console.log(` [2] 🔔 Send Generic Test Alert to all registered devices`);
			console.log(` [3] 💖 Select a Bond to trigger targeted milestone alerts`);
			console.log(` [4] 📋 Inspect DB Subscriptions & Bonds`);
			console.log(` [5] ⏩ Fast-Forward Date Simulation (Check future milestones)`);
			console.log(` [0] 🚪 Exit\n`);

			const choice = (await rl.question(bold('Enter choice [0-5]: '))).trim();

			if (choice === '1') {
				await handleRunCron(db);
			} else if (choice === '2') {
				await handleSendGenericTest(db);
			} else if (choice === '3') {
				await handleSelectBondMenu(rl, db);
			} else if (choice === '4') {
				await handleInspectDb(db);
			} else if (choice === '5') {
				await handleSimulation(rl, db);
			} else if (choice === '0' || choice.toLowerCase() === 'exit' || choice.toLowerCase() === 'q') {
				console.log(green('\nGoodbye! ❤️\n'));
				break;
			} else {
				console.log(yellow('Invalid selection. Please enter 0-5.'));
			}
		}
	} finally {
		rl.close();
		db.close();
	}
}

main().catch((err) => {
	console.error(red('Fatal error:'), err);
	process.exit(1);
});
