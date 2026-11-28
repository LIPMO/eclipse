// Bot Discord ECLIPSE : programme séparé du serveur du jeu. Il ne parle au jeu que par l'API /api/bot (clé secrète).
// Si le bot plante, le jeu continue ; si le jeu redémarre, le bot attend et réessaie.
import 'dotenv/config';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, ECLIPSE_API_KEY } = process.env;
const SITE = (process.env.ECLIPSE_URL || 'https://eclipseee.online').replace(/\/+$/, '');
for (const [k, v] of Object.entries({ DISCORD_TOKEN, DISCORD_CLIENT_ID, ECLIPSE_API_KEY })) if (!v) { console.error(`❌ ${k} manquant dans le fichier .env`); process.exit(1); }

const VIOLET = 0xa259ff, LOGO = `${SITE}/img/logo-512.png`;
const MODES = { assault: 'Assaut', duel: 'Duel', ffa: 'Mêlée', gungame: 'Gun Game' };
const fmt = n => Number(n || 0).toLocaleString('fr-FR');

async function api(path, opts = {}) {
  const r = await fetch(`${SITE}/api/bot/${path}`, { ...opts, headers: { Authorization: `Bearer ${ECLIPSE_API_KEY}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
}
const embed = (title, desc) => new EmbedBuilder().setColor(VIOLET).setTitle(title).setDescription(desc || null).setThumbnail(LOGO).setFooter({ text: 'ECLIPSE · eclipseee.online', iconURL: LOGO }).setTimestamp();
const playBtn = (label = 'Jouer maintenant', url = SITE) => new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url));

const commands = [
  { data: new SlashCommandBuilder().setName('stats').setDescription('Statistiques d\'un joueur').addStringOption(o => o.setName('joueur').setDescription('Pseudo dans le jeu').setRequired(true)),
    async run(i) {
      const p = await api('player?name=' + encodeURIComponent(i.options.getString('joueur')));
      const s = p.stats || {}, kd = s.deaths ? (s.kills / s.deaths).toFixed(2) : fmt(s.kills);
      const e = embed(`${p.name}${p.clan ? ` [${p.clan}]` : ''}`, `${p.title ? `*${p.title}*\n` : ''}${p.status === 'hors ligne' ? '⚫ Hors ligne' : `🟢 ${p.status}`}`)
        .addFields(
          { name: '⭐ Niveau', value: `${p.level}${p.prestige ? ` (prestige ${p.prestige})` : ''}`, inline: true },
          { name: '🏅 Rang', value: `${p.rank} · ${p.elo} elo`, inline: true },
          { name: '🎮 Parties', value: `${fmt(s.matches)} · ${fmt(s.wins)} victoires`, inline: true },
          { name: '💀 Éliminations', value: `${fmt(s.kills)} (K/D ${kd})`, inline: true },
          { name: '🎯 Tirs à la tête', value: `${fmt(s.hsKills)}`, inline: true },
          { name: '🏆 Tournois gagnés', value: `${fmt(p.tournamentWins)}`, inline: true });
      if (p.motto) e.addFields({ name: '💬 Devise', value: p.motto });
      return { embeds: [e] };
    } },
  { data: new SlashCommandBuilder().setName('classement').setDescription('Top 15 des joueurs').addStringOption(o => o.setName('type').setDescription('Classement').addChoices(
      { name: 'Niveau', value: 'level' }, { name: 'Classé (elo)', value: 'elo' }, { name: 'Cette semaine', value: 'week' }, { name: 'Éliminations', value: 'kills' }, { name: 'Victoires', value: 'wins' })),
    async run(i) {
      const d = await api('leaderboard?kind=' + (i.options.getString('type') || 'level'));
      const medal = n => ['🥇', '🥈', '🥉'][n - 1] || `\`${String(n).padStart(2)}\``;
      const label = { level: 'Niveau', elo: 'Classé', week: 'Semaine', kills: 'Éliminations', wins: 'Victoires' }[d.kind];
      return { embeds: [embed(`🏆 Classement · ${label}`, d.rows.length ? d.rows.map(r => `${medal(r.pos)} **${r.name}** — ${fmt(r.v)}`).join('\n') : 'Personne pour le moment.')] };
    } },
  { data: new SlashCommandBuilder().setName('serveur').setDescription('État du serveur ECLIPSE'),
    async run() {
      const s = await api('status'), h = Math.floor(s.uptime / 3600), m = Math.floor(s.uptime % 3600 / 60);
      return { embeds: [embed(s.maintenance ? '🛠️ Serveur en maintenance' : '🟢 Serveur en ligne').addFields(
        { name: 'Joueurs connectés', value: fmt(s.online), inline: true }, { name: 'Parties en cours', value: fmt(s.matches), inline: true },
        { name: 'Salons', value: fmt(s.rooms), inline: true }, { name: 'Version', value: s.version, inline: true }, { name: 'En ligne depuis', value: `${h} h ${m} min`, inline: true })], components: [playBtn()] };
    } },
  { data: new SlashCommandBuilder().setName('enligne').setDescription('Joueurs connectés en ce moment'),
    async run() {
      const d = await api('online');
      return { embeds: [embed(`🟢 ${d.count} joueur(s) en ligne`, d.players.length ? d.players.map(p => `• **${p.name}** — ${p.status}`).join('\n') : 'Aucun joueur avec un compte connecté.')] };
    } },
  { data: new SlashCommandBuilder().setName('salons').setDescription('Salons publics ouverts'),
    async run() {
      const d = await api('rooms');
      return { embeds: [embed('🎮 Salons publics', d.rooms.length ? d.rooms.slice(0, 20).map(r => `• **${r.name}** — ${MODES[r.mode] || r.mode} · ${r.humans}/${r.max} · ${r.state === 'playing' ? 'en partie' : 'en attente'}`).join('\n') : 'Aucun salon ouvert. Crée-en un avec /creer-partie !')], components: [playBtn()] };
    } },
  { data: new SlashCommandBuilder().setName('creer-partie').setDescription('Crée un salon privé et donne son code').addStringOption(o => o.setName('mode').setDescription('Mode de jeu').addChoices(
      { name: 'Assaut (5 contre 5)', value: 'assault' }, { name: 'Duel (1 contre 1)', value: 'duel' }, { name: 'Mêlée générale', value: 'ffa' }, { name: 'Gun Game', value: 'gungame' })),
    async run(i) {
      const d = await api('room', { method: 'POST', body: JSON.stringify({ mode: i.options.getString('mode') || 'assault', name: `Discord · ${i.user.username}`.slice(0, 28) }) });
      return { embeds: [embed('🎮 Salon privé créé !', `Code : **\`${d.code}\`**\n\nDans le jeu : **JOUER → Rejoindre avec un code**, puis entre \`${d.code}\`.`).addFields(
        { name: 'Mode', value: MODES[d.mode] || d.mode, inline: true }, { name: 'Places', value: String(d.max), inline: true }, { name: 'Créé par', value: `<@${i.user.id}>`, inline: true })
        .setFooter({ text: 'Le salon se ferme s\'il reste vide 10 minutes.' })], components: [playBtn('Ouvrir le jeu')] };
    } },
  { data: new SlashCommandBuilder().setName('boutique').setDescription('Boutique du jour'),
    async run() {
      const d = await api('shop'), line = x => `• **${x.name}** — ~~${fmt(x.old)}~~ **${fmt(x.price)}** Éclats (-${x.off} %)`;
      const e = embed(`🛒 Boutique du jour · ${d.theme}`).addFields({ name: '⭐ En vedette', value: d.featured.map(line).join('\n') || '—' }, { name: '📅 Quotidien', value: d.daily.map(line).join('\n') || '—' });
      if (d.bundle) e.addFields({ name: '📦 Pack', value: `${d.bundle.name} (-${d.bundle.off} %)` });
      return { embeds: [e], components: [playBtn('Voir la boutique', SITE + '/#boutique')] };
    } },
  { data: new SlashCommandBuilder().setName('tournois').setDescription('Tournois en cours et à venir'),
    async run() {
      const d = await api('tournaments');
      const st = { open: '🟢 Inscriptions ouvertes', wait: '⏳ Bientôt', ready: '⏳ Prêt à démarrer', playing: '⚔️ En cours', running: '⚔️ En cours', done: '🏁 Terminé', cancelled: '❌ Annulé' };
      return { embeds: [embed('🏆 Tournois', d.list.length ? d.list.map(t => `**${t.name}** — ${st[t.status] || t.status}\n${t.players}/${t.size} joueurs · ${fmt(t.prize)} Éclats${t.startAt ? ` · <t:${Math.floor(t.startAt / 1000)}:R>` : ''}`).join('\n\n') : 'Aucun tournoi pour le moment.')] };
    } },
  { data: new SlashCommandBuilder().setName('createur').setDescription('Infos sur un code créateur').addStringOption(o => o.setName('code').setDescription('Code créateur').setRequired(true)),
    async run(i) {
      const c = await api('creator?code=' + encodeURIComponent(i.options.getString('code')));
      const links = Object.entries(c.links || {}).map(([k, l]) => `[${k}](${l.url})`).join(' · ');
      return { embeds: [embed(`💜 Code créateur ${c.code}`, `par **${c.name}** · niveau ${c.level}${c.slogan ? `\n> ${c.slogan}` : ''}${links ? `\n${links}` : ''}`).setColor(parseInt(c.color.slice(1), 16))
        .addFields({ name: 'Joueurs qui le soutiennent', value: fmt(c.supporters), inline: true })], components: [playBtn('Soutenir ce créateur', `${SITE}/?soutien=${encodeURIComponent(c.code)}`)] };
    } },
  { data: new SlashCommandBuilder().setName('nouveautes').setDescription('Dernière mise à jour du jeu'),
    async run() {
      const [n] = (await api('news')).news;
      if (!n) return { content: 'Aucune nouveauté.' };
      return { embeds: [embed(`🆕 ${n.version} · ${n.title}`, n.items.map(x => `• ${x}`).join('\n').slice(0, 4000))], components: [playBtn()] };
    } },
  { data: new SlashCommandBuilder().setName('jouer').setDescription('Lien pour jouer à ECLIPSE'),
    async run() { return { embeds: [embed('🎮 Jouer à ECLIPSE', 'Shooter tactique gratuit, directement dans le navigateur. Ou télécharge le launcher pour Windows.')], components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Jouer dans le navigateur').setURL(SITE), new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Télécharger le launcher').setURL(SITE + '/telecharger'))] }; } },
  { data: new SlashCommandBuilder().setName('aide').setDescription('Liste des commandes du bot'),
    async run() { return { embeds: [embed('📖 Commandes ECLIPSE', commands.map(c => `**/${c.data.name}** — ${c.data.description}`).join('\n'))] }; } },
];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once('ready', async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN), body = commands.map(c => c.data.toJSON());
  try {
    await rest.put(DISCORD_GUILD_ID ? Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID) : Routes.applicationCommands(DISCORD_CLIENT_ID), { body });
    console.log(`✅ ${body.length} commandes enregistrées ${DISCORD_GUILD_ID ? 'sur ton serveur' : 'partout (peut prendre jusqu\'à 1 h)'}`);
  } catch (e) { console.error('❌ Enregistrement des commandes impossible :', e.message); }
  try { const s = await api('status'); console.log(`✅ API du jeu joignable (version ${s.version}, ${s.online} en ligne)`); }
  catch (e) { console.error(`⚠️ API du jeu : ${e.message} (vérifie ECLIPSE_API_KEY et la clé dans l'administration)`); }
  const presence = async () => { try { const s = await api('status'); client.user.setActivity(`${s.online} joueur(s) sur ECLIPSE`); } catch { client.user.setActivity('eclipseee.online'); } };
  presence(); setInterval(presence, 60000);
});
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;
  const cmd = commands.find(c => c.data.name === i.commandName); if (!cmd) return;
  try { await i.deferReply(); await i.editReply(await cmd.run(i)); }
  catch (e) { const msg = { embeds: [new EmbedBuilder().setColor(0xff4d5e).setDescription(`❌ ${e.message}`)] }; try { i.deferred ? await i.editReply(msg) : await i.reply({ ...msg, ephemeral: true }); } catch { /* */ } }
});
process.on('unhandledRejection', e => console.error('Erreur :', e?.message || e));
client.login(DISCORD_TOKEN);
