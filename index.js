const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes, AttachmentBuilder, PermissionsBitField, version } = require('discord.js');
const fs = require('fs');
const os = require('os');
const axios = require('axios');
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// Khởi tạo client
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });

// Lưu trữ dữ liệu
let prefixes = {}, autoReplies = {}, feedbacks = {};
if (fs.existsSync('./prefixes.json')) prefixes = JSON.parse(fs.readFileSync('./prefixes.json', 'utf8'));
if (fs.existsSync('./autoreplies.json')) autoReplies = JSON.parse(fs.readFileSync('./autoreplies.json', 'utf8'));
if (fs.existsSync('./feedbacks.json')) feedbacks = JSON.parse(fs.readFileSync('./feedbacks.json', 'utf8'));

// Lưu trữ cooldown
const cooldowns = new Map();

// Hàm lưu dữ liệu
const saveData = () => {
    fs.writeFileSync('./prefixes.json', JSON.stringify(prefixes, null, 2));
    fs.writeFileSync('./autoreplies.json', JSON.stringify(autoReplies, null, 2));
    fs.writeFileSync('./feedbacks.json', JSON.stringify(feedbacks, null, 2));
};

// Tạo embed chuẩn
const createEmbed = (title, description, color = config.embedColor) => {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color);
    if (description) { // Chỉ set description nếu nó không phải là chuỗi rỗng
        embed.setDescription(description);
    }
    return embed;
};

// Tạo embed hướng dẫn
const createUsageEmbed = (prefix, command, usage) => {
    return createEmbed(
        `${config.emotes.info} Hướng Dẫn Lệnh: ${command}`,
        `**Sử dụng:** \`${prefix}${command} ${usage}\``,
        '#ffcc00'
    );
};

// Tạo embed đẹp cho autoreply
const createAutoreplyEmbed = (text, images = []) => {
    const embed = new EmbedBuilder()
        .setColor(config.autoreplyColor || config.embedColor);
    
    const description = config.embedDesign?.useQuote ? `### ${text || ''}` : `### ${text || ''}`;
    if (description) {
        embed.setDescription(description);
    }
    
    if (images && images.length > 0) {
        embed.setImage(images[images.length - 1]);
    }
    
    return embed;
};

// Hàm phân tích thời gian
const parseDuration = (duration) => {
    const regex = /^(\d+)(s|m|h|d)$/i;
    const match = duration.match(regex);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
        case 's': return value * 1000; // Giây
        case 'm': return value * 60 * 1000; // Phút
        case 'h': return value * 60 * 60 * 1000; // Giờ
        case 'd': return value * 24 * 60 * 60 * 1000; // Ngày
        default: return null;
    }
};

// Slash commands
const commands = [
    new SlashCommandBuilder().setName('prefix').setDescription(`${config.emotes.settings} Thay đổi prefix của bot`).addStringOption(o => o.setName('new_prefix').setDescription('Prefix mới').setRequired(true)),
    new SlashCommandBuilder().setName('autoreply').setDescription(`${config.emotes.reply} Tạo hoặc chỉnh sửa một autoreply`)
        .addStringOption(o => o.setName('key').setDescription('Từ khóa kích hoạt').setRequired(true))
        .addStringOption(o => o.setName('reply').setDescription('Nội dung trả lời').setRequired(true))
        .addAttachmentOption(o => o.setName('image1').setDescription('Hình ảnh đính kèm 1')),
    new SlashCommandBuilder().setName('autoreplylist').setDescription(`${config.emotes.list} Hiển thị danh sách các autoreply`),
    new SlashCommandBuilder().setName('autoreply-remove').setDescription(`${config.emotes.delete} Xóa một autoreply`).addStringOption(o => o.setName('key').setDescription('Từ khóa của autoreply cần xóa').setRequired(true)),
    new SlashCommandBuilder().setName('ban').setDescription(`${config.emotes.ban} Cấm một thành viên`).addUserOption(o => o.setName('user').setDescription('Thành viên cần cấm').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Lý do cấm')),
    new SlashCommandBuilder().setName('unban').setDescription(`${config.emotes.unban} Gỡ cấm một thành viên`).addStringOption(o => o.setName('userid').setDescription('ID của thành viên cần gỡ cấm').setRequired(true)),
    new SlashCommandBuilder().setName('kick').setDescription(`${config.emotes.kick} Trục xuất một thành viên`).addUserOption(o => o.setName('user').setDescription('Thành viên cần trục xuất').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Lý do trục xuất')),
    new SlashCommandBuilder().setName('timeout').setDescription(`${config.emotes.timeout} Cách ly một thành viên`).addUserOption(o => o.setName('user').setDescription('Thành viên cần cách ly').setRequired(true)).addIntegerOption(o => o.setName('minutes').setDescription('Số phút cách ly').setRequired(true)),
    new SlashCommandBuilder().setName('untimeout').setDescription(`${config.emotes.untimeout} Gỡ cách ly một thành viên`).addUserOption(o => o.setName('user').setDescription('Thành viên cần gỡ cách ly').setRequired(true)),
    new SlashCommandBuilder().setName('ping').setDescription(`${config.emotes.ping} Kiểm tra độ trễ của bot`),
    new SlashCommandBuilder().setName('uptime').setDescription(`${config.emotes.uptime} Xem thời gian hoạt động của bot`),
    new SlashCommandBuilder().setName('help').setDescription(`${config.emotes.help} Hiển thị bảng trợ giúp`),
    new SlashCommandBuilder().setName('serverinfo').setDescription(`${config.emotes.server} Hiển thị thông tin server`),
    new SlashCommandBuilder().setName('userinfo').setDescription(`${config.emotes.user} Hiển thị thông tin người dùng`).addUserOption(o => o.setName('user').setDescription('Người dùng cần xem')),
    new SlashCommandBuilder().setName('status').setDescription(`${config.emotes.status} Hiển thị trạng thái của bot`),
    new SlashCommandBuilder().setName('clear').setDescription(`${config.emotes.clear} Xóa tin nhắn trong kênh`).addIntegerOption(o => o.setName('amount').setDescription('Số lượng tin nhắn cần xóa').setRequired(true)),
    new SlashCommandBuilder().setName('slowmode').setDescription(`${config.emotes.slowmode} Đặt chế độ chậm cho kênh`).addIntegerOption(o => o.setName('seconds').setDescription('Số giây (0 để tắt)').setRequired(true)),
    new SlashCommandBuilder().setName('avatar').setDescription(`${config.emotes.avatar} Lấy avatar của người dùng`).addUserOption(o => o.setName('user').setDescription('Người dùng cần xem')),
    new SlashCommandBuilder().setName('poll').setDescription(`${config.emotes.poll} Tạo một cuộc bình chọn`).addStringOption(o => o.setName('question').setDescription('Câu hỏi bình chọn').setRequired(true)),
    new SlashCommandBuilder().setName('translate').setDescription(`${config.emotes.translate} Dịch văn bản`).addStringOption(o => o.setName('text').setDescription('Văn bản cần dịch').setRequired(true)).addStringOption(o => o.setName('to').setDescription('Ngôn ngữ đích (ví dụ: en, vi)').setRequired(true)),
    new SlashCommandBuilder().setName('movie').setDescription(`${config.emotes.movie} Xem thông tin phim`).addStringOption(o => o.setName('title').setDescription('Tên phim').setRequired(true)),
    new SlashCommandBuilder().setName('meme').setDescription(`${config.emotes.meme} Hiển thị một meme ngẫu nhiên`),
    new SlashCommandBuilder().setName('8ball').setDescription(`${config.emotes['8ball']} Hỏi quả cầu ma thuật`).addStringOption(o => o.setName('question').setDescription('Câu hỏi của bạn').setRequired(true)),
    new SlashCommandBuilder().setName('coinflip').setDescription(`${config.emotes.coinflip} Tung đồng xu`),
    new SlashCommandBuilder().setName('weather').setDescription(`${config.emotes.weather} Xem thời tiết`).addStringOption(o => o.setName('city').setDescription('Tên thành phố').setRequired(true)),
    new SlashCommandBuilder().setName('crypto').setDescription(`${config.emotes.crypto} Xem giá tiền điện tử`).addStringOption(o => o.setName('symbol').setDescription('Ký hiệu (ví dụ: BTC, ETH)').setRequired(true)),
    new SlashCommandBuilder()
        .setName('feedback')
        .setDescription(`${config.emotes.feedback || '📝'} Gửi phản hồi với nhận xét và hình ảnh`)
        .addStringOption(o => o.setName('comment').setDescription('Nhận xét của bạn').setRequired(true))
        .addAttachmentOption(o => o.setName('image1').setDescription('Hình ảnh đính kèm 1').setRequired(false))
        .addAttachmentOption(o => o.setName('image2').setDescription('Hình ảnh đính kèm 2').setRequired(false))
        .addAttachmentOption(o => o.setName('image3').setDescription('Hình ảnh đính kèm 3').setRequired(false))
        .addAttachmentOption(o => o.setName('image4').setDescription('Hình ảnh đính kèm 4').setRequired(false))
        .addAttachmentOption(o => o.setName('image5').setDescription('Hình ảnh đính kèm 5').setRequired(false)),
    new SlashCommandBuilder()
        .setName('mute')
        .setDescription(`${config.emotes.mute || '🔇'} Tạm thời mute một thành viên`)
        .addUserOption(o => o.setName('user').setDescription('Thành viên cần mute').setRequired(true))
        .addStringOption(o => o.setName('duration').setDescription('Thời gian mute (e.g., 30s, 5m, 2h, 1d)').setRequired(true))
];

// Đăng ký slash commands
const rest = new REST({ version: '10' }).setToken(config.token);
(async () => {
    try {
        console.log('Bắt đầu đăng ký slash commands...');
        await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
        console.log(`${config.emotes.success} Đã đăng ký slash commands thành công!`);
    } catch (error) {
        console.error('Lỗi khi đăng ký slash commands:', error);
    }
})();

// Bot ready
client.once('ready', () => {
    console.log(`${config.emotes.online} Bot ${client.user.tag} đã hoạt động!`);
    client.user.setPresence({
        activities: [{ name: 'NTDShare Hack', type: 0 }], // 0 = Playing
        status: 'dnd' // Trạng thái: 'online', 'idle', 'dnd', 'invisible'
    });
});

// Xử lý tin nhắn
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const prefix = prefixes[message.guild.id] || config.defaultPrefix;

    // Chống Link & Invite
    const linkRegex = /(https?:\/\/[^\s]+)|(discord\.gg\/[a-zA-Z0-9]+)/gi;
    const hasLink = linkRegex.test(message.content);
    const allowedRoles = config.allowedLinkRoles || [];
    const isExempt = message.member.permissions.has(PermissionsBitField.Flags.Administrator) || message.member.roles.cache.some(role => allowedRoles.includes(role.id));

    if (hasLink && !isExempt) {
        try {
            await message.delete();
            const warningEmbed = createEmbed(`${config.emotes.warning} Cảnh Báo Gửi Link`, `Không được phép gửi liên kết ở đây. Tin nhắn của bạn đã bị xóa.`, '#ff3333');
            const warningMsg = await message.channel.send({ content: `${message.author}`, embeds: [warningEmbed] });
            setTimeout(() => warningMsg.delete().catch(console.error), 10000);
        } catch (error) {
            console.error(`Lỗi khi xử lý link:`, error);
        }
        return;
    }

    // Auto Reply
    const blockedAutoreplyChannels = ['1375424288320131173', '1375932764028801045'];
    if (!blockedAutoreplyChannels.includes(message.channel.id)) {
        for (const [key, replyData] of Object.entries(autoReplies)) {
            if (message.content.toLowerCase().includes(key.toLowerCase())) {
                const embed = createAutoreplyEmbed(replyData.text, replyData.images);
                const row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setLabel('LẤY KEY FREE').setEmoji(config.buttons.getKey.emote).setStyle(ButtonStyle.Link).setURL(config.buttons.getKey.url),
                    new ButtonBuilder().setLabel('SHOP BÁN KEY').setEmoji('<a:party_blob80:1382636243279417374>').setStyle(ButtonStyle.Link).setURL('https://ntdsharehax.top'),
                    new ButtonBuilder().setLabel('DISCORD ADMIN').setEmoji(config.buttons.discordAdmin.emote).setStyle(ButtonStyle.Primary).setCustomId('discord_admin')
                );
                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setLabel('ZALO ADMIN').setEmoji(config.buttons.zaloAdmin.emote).setStyle(ButtonStyle.Link).setURL(config.buttons.zaloAdmin.url),
                    new ButtonBuilder().setLabel('DOWLOAD HACK').setEmoji('<a:party_blob80:1382636243279417374>').setStyle(ButtonStyle.Link).setURL('https://bio.link/ntdshare')
                );
                return message.reply({ embeds: [embed], components: [row1, row2] });
            }
        }
    }
    
    if (!message.content.startsWith(prefix)) return;
    
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Prefix command handler
    switch (command) {
        case 'prefix':
            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return message.reply({ embeds: [createEmbed(`${config.emotes.error} Lỗi`, 'Bạn không có quyền sử dụng lệnh này.')] });
            if (!args[0]) return message.reply({ embeds: [createUsageEmbed(prefix, 'prefix', '<new_prefix>')] });
            prefixes[message.guild.id] = args[0];
            saveData();
            message.reply({ embeds: [createEmbed(`${config.emotes.success} Thành công`, `Prefix đã được đổi thành \`${args[0]}\`.`)] });
            break;

        case 'autoreply':
            if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return message.reply({ embeds: [createEmbed(`${config.emotes.error} Lỗi`, 'Bạn không có quyền quản lý tin nhắn.')] });
            const key = args.shift();
            const reply = args.join(' ');
            if (!key || !reply) return message.reply({ embeds: [createUsageEmbed(prefix, 'autoreply', '<key> <reply>')] });
            
            const images = message.attachments.map(a => a.url);
            autoReplies[key] = { text: reply, images: images };
            saveData();
            message.reply({ embeds: [createEmbed(`${config.emotes.success} Thành công`, `Đã tạo autoreply cho từ khóa \`${key}\`.`)] });
            break;

        case 'autoreplylist':
            if (Object.keys(autoReplies).length === 0) {
                return message.reply({ embeds: [createEmbed(`${config.emotes.info} Danh Sách Trống`, 'Hiện tại không có autoreply nào được thiết lập.')] });
            }
            const list = Object.entries(autoReplies).map(([k, v], i) => {
                const imgCount = v.images.length > 0 ? ` ${config.emotes.list} (${v.images.length})` : '';
                return `> **${i + 1}.** \`${k}\` → ${v.text}${imgCount}`;
            }).join('\n');
            message.reply({ embeds: [createEmbed(`${config.emotes.list} Danh Sách Autoreply`, list)] });
            break;

        case 'autoreply-remove':
            if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return message.reply({ embeds: [createEmbed(`${config.emotes.error} Lỗi`, 'Bạn không có quyền quản lý tin nhắn.')] });
            const removeKey = args[0];
            if (!removeKey) return message.reply({ embeds: [createUsageEmbed(prefix, 'autoreply-remove', '<key>')] });
            if (!autoReplies[removeKey]) return message.reply({ embeds: [createEmbed(`${config.emotes.error} Lỗi`, `Không tìm thấy autoreply với từ khóa \`${removeKey}\`.`)] });
            delete autoReplies[removeKey];
            saveData();
            message.reply({ embeds: [createEmbed(`${config.emotes.success} Thành công`, `Đã xóa autoreply cho từ khóa \`${removeKey}\`.`)] });
            break;
        
        case 'ban':
            if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return;
            const banUser = message.mentions.users.first();
            if (!banUser) return message.reply({ embeds: [createUsageEmbed(prefix, 'ban', '@user [reason]')] });
            const banReason = args.slice(1).join(' ') || 'Không có lý do được cung cấp.';
            try {
                await message.guild.members.ban(banUser, { reason: banReason });
                message.reply({ embeds: [createEmbed(`${config.emotes.ban} Đã Cấm Thành Viên`, `**${banUser.tag}** đã bị cấm.\n**Lý do:** ${banReason}`)] });
            } catch (error) {
                message.reply({ embeds: [createEmbed(`${config.emotes.error} Lỗi`, `Không thể cấm thành viên này.`, '#ff3333')] });
            }
            break;

        case 'unban':
            if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return;
            const userId = args[0];
            if (!userId) return message.reply({ embeds: [createUsageEmbed(prefix, 'unban', '<user_id>')] });
            try {
                await message.guild.bans.remove(userId);
                message.reply({ embeds: [createEmbed(`${config.emotes.unban} Đã Gỡ Cấm`, `Đã gỡ cấm cho người dùng với ID \`${userId}\`.`)] });
            } catch (error) {
                message.reply({ embeds: [createEmbed(`${config.emotes.error} Lỗi`, `Không thể gỡ cấm. Vui lòng kiểm tra lại ID.`, '#ff3333')] });
            }
            break;

        case 'kick':
            if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return;
            const kickUser = message.mentions.users.first();
            if (!kickUser) return message.reply({ embeds: [createUsageEmbed(prefix, 'kick', '@user [reason]')] });
            const kickReason = args.slice(1).join(' ') || 'Không có lý do được cung cấp.';
            try {
                await message.guild.members.kick(kickUser, { reason: kickReason });
                message.reply({ embeds: [createEmbed(`${config.emotes.kick} Đã Trục Xuất`, `**${kickUser.tag}** đã bị trục xuất.\n**Lý do:** ${kickReason}`)] });
            } catch (error) {
                message.reply({ embeds: [createEmbed(`${config.emotes.error} Lỗi`, `Không thể trục xuất thành viên này.`, '#ff3333')] });
            }
            break;

        case 'timeout':
            if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
            const timeoutUser = message.mentions.users.first();
            if (!timeoutUser) return message.reply({ embeds: [createUsageEmbed(prefix, 'timeout', '@user <minutes>')] });
            const minutes = parseInt(args[1]);
            if (isNaN(minutes)) return message.reply({ embeds: [createUsageEmbed(prefix, 'timeout', '@user <minutes>')] });
            try {
                await message.guild.members.resolve(timeoutUser).timeout(minutes * 60 * 1000, 'Bị cách ly bởi bot.');
                message.reply({ embeds: [createEmbed(`${config.emotes.timeout} Đã Cách Ly`, `**${timeoutUser.tag}** đã bị cách ly trong ${minutes} phút.`)] });
            } catch (error) {
                message.reply({ embeds: [createEmbed(`${config.emotes.error} Lỗi`, `Không thể cách ly thành viên này.`, '#ff3333')] });
            }
            break;

        case 'untimeout':
            if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
            const untimeoutUser = message.mentions.users.first();
            if (!untimeoutUser) return message.reply({ embeds: [createUsageEmbed(prefix, 'untimeout', '@user')] });
            try {
                await message.guild.members.resolve(untimeoutUser).timeout(null);
                message.reply({ embeds: [createEmbed(`${config.emotes.untimeout} Đã Gỡ Cách Ly`, `Đã gỡ cách ly cho **${untimeoutUser.tag}**.`)] });
            } catch (error) {
                message.reply({ embeds: [createEmbed(`${config.emotes.error} Lỗi`, `Không thể gỡ cách ly.`, '#ff3333')] });
            }
            break;

        case 'ping':
            const sent = await message.reply({ embeds: [createEmbed(`${config.emotes.ping} Đang kiểm tra...`, 'Vui lòng chờ.')] });
            const botLatency = sent.createdTimestamp - message.createdTimestamp;
            const apiLatency = Math.round(client.ws.ping);
            const pingEmbed = createEmbed(`${config.emotes.ping} Pong!`, 
                `> ${config.emotes.latency} **Độ trễ Bot:** \`${botLatency}ms\`\n> ${config.emotes.api} **Độ trễ API:** \`${apiLatency}ms\``
            );
            sent.edit({ embeds: [pingEmbed] });
            break;
            
        case 'uptime':
            const uptime = process.uptime();
            const d = Math.floor(uptime / 86400);
            const h = Math.floor(uptime / 3600) % 24;
            const m = Math.floor(uptime / 60) % 60;
            const s = Math.floor(uptime) % 60;
            message.reply({ embeds: [createEmbed(`${config.emotes.uptime} Thời Gian Hoạt Động`, `> Bot đã hoạt động được: **${d}** ngày, **${h}** giờ, **${m}** phút, **${s}** giây.`)] });
            break;

        case 'serverinfo':
            const owner = await message.guild.fetchOwner();
            const serverEmbed = createEmbed(`${config.emotes.server} Thông Tin Server`, `**Tên Server:** ${message.guild.name} (\`${message.guild.id}\`)`)
                .setThumbnail(message.guild.iconURL({ dynamic: true }))
                .addFields(
                    { name: 'Chủ Sở Hữu', value: `> ${owner.user.tag}`, inline: true },
                    { name: 'Ngày Tạo', value: `> <t:${parseInt(message.guild.createdTimestamp / 1000)}:R>`, inline: true },
                    { name: 'Thành Viên', value: `> ${message.guild.memberCount}`, inline: true },
                    { name: 'Số Lượng Kênh', value: `> **Text:** ${message.guild.channels.cache.filter(c => c.type === 0).size}\n> **Voice:** ${message.guild.channels.cache.filter(c => c.type === 2).size}`, inline: true },
                    { name: 'Số Lượng Roles', value: `> ${message.guild.roles.cache.size}`, inline: true },
                    { name: 'Cấp Độ Boost', value: `> Cấp ${message.guild.premiumTier} (${message.guild.premiumSubscriptionCount} lượt boost)`, inline: true }
                );
            message.reply({ embeds: [serverEmbed] });
            break;

        case 'userinfo':
            const targetUser = message.mentions.users.first() || message.author;
            const memberInfo = await message.guild.members.fetch(targetUser.id);
            const userEmbed = createEmbed(`${config.emotes.user} Thông Tin Người Dùng`, `**Tên:** ${targetUser.username} (\`${targetUser.id}\`)`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'Biệt Danh', value: `> ${memberInfo.displayName}`, inline: true },
                    { name: 'Ngày Tham Gia', value: `> <t:${parseInt(memberInfo.joinedTimestamp / 1000)}:R>`, inline: true },
                    { name: 'Ngày Tạo TK', value: `> <t:${parseInt(targetUser.createdTimestamp / 1000)}:R>`, inline: true },
                    { name: 'Roles', value: `> ${memberInfo.roles.cache.map(r => r).join(', ')}` }
                );
            message.reply({ embeds: [userEmbed] });
            break;

        case 'status':
            const statusEmbed = createEmbed(`${config.emotes.status} Trạng Thái Bot`, `Đây là các thông số hiện tại của bot.`)
                .addFields(
                    { name: 'Phiên Bản', value: `> **Discord.js:** v${version}\n> **Node.js:** ${process.version}`, inline: true },
                    { name: 'Hệ Thống', value: `> **Hệ điều hành:** ${os.type()}\n> **CPU:** ${os.cpus()[0].model}`, inline: true },
                    { name: 'Bộ Nhớ', value: `> **Sử dụng:** ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB\n> **Tổng:** ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`, inline: true }
                );
            message.reply({ embeds: [statusEmbed] });
            break;
        
        case 'help':
            const helpEmbed = createEmbed(`${config.emotes.help} Bảng Lệnh`, `Sử dụng \`${prefix}\` hoặc \`/\` để gọi lệnh.`)
                .addFields(
                    { name: `${config.emotes.settings} Quản Lý`, value: `\`${prefix}prefix\`, \`${prefix}autoreply\`, \`${prefix}autoreplylist\`, \`${prefix}autoreply-remove\`` },
                    { name: `${config.emotes.moderation} Moderation`, value: `\`${prefix}ban\`, \`${prefix}unban\`, \`${prefix}kick\`, \`${prefix}timeout\`, \`${prefix}untimeout\`, \`${prefix}clear\`, \`${prefix}slowmode\`, \`${prefix}mute\`` },
                    { name: `${config.emotes.utility} Tiện Ích`, value: `\`${prefix}ping\`, \`${prefix}uptime\`, \`${prefix}avatar\`, \`${prefix}poll\`, \`${prefix}translate\`` },
                    { name: `${config.emotes.info} Thông Tin`, value: `\`${prefix}serverinfo\`, \`${prefix}userinfo\`, \`${prefix}status\`` },
                    { name: `${config.emotes.meme} Giải Trí`, value: `\`${prefix}meme\`, \`${prefix}8ball\`, \`${prefix}coinflip\`` },
                    { name: `${config.emotes.crypto} Tài Chính`, value: `\`${prefix}weather\`, \`${prefix}crypto\`` }
                );
            message.reply({ embeds: [helpEmbed] });
            break;
    }
});

// Xử lý slash commands
client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        if (interaction.customId === 'discord_admin') {
            return interaction.reply({ content: `> ${config.emotes.info} **Admin Discord:** <@${config.adminId}>`, ephemeral: true });
        }
    }
    
    if (!interaction.isChatInputCommand()) return;
    
    const { commandName, options, guild, user, member } = interaction;
    
    const checkPermissions = (permission) => {
        if (!member.permissions.has(permission) && user.id !== config.ownerId) {
            const embed = createEmbed(`${config.emotes.error} Truy Cập Bị Từ Chối`, `Rất tiếc, bạn không có quyền \`${permission}\` để sử dụng lệnh này.`, '#ff3333');
            interaction.reply({ embeds: [embed], ephemeral: true });
            return false;
        }
        return true;
    };

    switch (commandName) {
        case 'prefix':
            if (!checkPermissions(PermissionsBitField.Flags.Administrator)) return;
            const newPrefix = options.getString('new_prefix');
            prefixes[guild.id] = newPrefix;
            saveData();
            interaction.reply({ embeds: [createEmbed(`${config.emotes.success} Prefix Đã Thay Đổi`, `Prefix mới của server đã được cập nhật thành \`${newPrefix}\`.`)] });
            break;
            
        case 'autoreply':
            if (!checkPermissions(PermissionsBitField.Flags.ManageMessages)) return;
            const key = options.getString('key');
            const reply = options.getString('reply');
            const images = [options.getAttachment('image1')].filter(Boolean).map(img => img.url);
            
            autoReplies[key] = { text: reply, images: images };
            saveData();
            
            const successMsg = images.length > 0 
                ? `Đã tạo autoreply cho từ khóa \`${key}\` với ${images.length} hình ảnh.`
                : `Đã tạo autoreply cho từ khóa \`${key}\`.`;
            interaction.reply({ embeds: [createEmbed(`${config.emotes.success} Autoreply Đã Tạo`, successMsg)] });
            break;
            
        case 'autoreplylist':
            if (Object.keys(autoReplies).length === 0) {
                return interaction.reply({ embeds: [createEmbed(`${config.emotes.info} Danh Sách Trống`, 'Hiện tại không có autoreply nào được thiết lập.')], ephemeral: true });
            }
            const list = Object.entries(autoReplies).map(([k, v], i) => {
                const imgCount = v.images.length > 0 ? ` ${config.emotes.list} (${v.images.length})` : '';
                return `> **${i + 1}.** \`${k}\` → ${v.text}${imgCount}`;
            }).join('\n');
            interaction.reply({ embeds: [createEmbed(`${config.emotes.list} Danh Sách Autoreply`, list)] });
            break;
            
        case 'autoreply-remove':
            if (!checkPermissions(PermissionsBitField.Flags.ManageMessages)) return;
            const removeKey = options.getString('key');
            if (!autoReplies[removeKey]) {
                return interaction.reply({ embeds: [createEmbed(`${config.emotes.error} Không Tìm Thấy`, `Không tìm thấy autoreply với từ khóa \`${removeKey}\`.`, '#ff3333')], ephemeral: true });
            }
            delete autoReplies[removeKey];
            saveData();
            interaction.reply({ embeds: [createEmbed(`${config.emotes.success} Đã Xóa Autoreply`, `Đã xóa thành công autoreply cho từ khóa \`${removeKey}\`.`)] });
            break;
            
        case 'ban':
            if (!checkPermissions(PermissionsBitField.Flags.BanMembers)) return;
            const banUser = options.getUser('user');
            const banReason = options.getString('reason') || 'Không có lý do được cung cấp.';
            try {
                await guild.members.ban(banUser, { reason: banReason });
                interaction.reply({ embeds: [createEmbed(`${config.emotes.ban} Đã Cấm Thành Viên`, `**${banUser.tag}** đã bị cấm.\n**Lý do:** ${banReason}`)] });
            } catch (error) {
                interaction.reply({ embeds: [createEmbed(`${config.emotes.error} Lỗi`, `Không thể cấm thành viên này. Có thể họ có quyền cao hơn bot.`, '#ff3333')], ephemeral: true });
            }
            break;

        case 'unban':
            if (!checkPermissions(PermissionsBitField.Flags.BanMembers)) return;
            const userId = options.getString('userid');
            try {
                await guild.bans.remove(userId);
                interaction.reply({ embeds: [createEmbed(`${config.emotes.unban} Đã Gỡ Cấm`, `Đã gỡ cấm cho người dùng với ID \`${userId}\`.`)] });
            } catch (error) {
                interaction.reply({ embeds: [createEmbed(`${config.emotes.error} Lỗi`, `Không thể gỡ cấm. Vui lòng kiểm tra lại ID.`, '#ff3333')], ephemeral: true });
            }
            break;

        case 'kick':
            if (!checkPermissions(PermissionsBitField.Flags.KickMembers)) return;
            const kickUser = options.getUser('user');
            const kickReason = options.getString('reason') || 'Không có lý do được cung cấp.';
            try {
                await guild.members.kick(kickUser, { reason: kickReason });
                interaction.reply({ embeds: [createEmbed(`${config.emotes.kick} Đã Trục Xuất`, `**${kickUser.tag}** đã bị trục xuất.\n**Lý do:** ${kickReason}`)] });
            } catch (error) {
                interaction.reply({ embeds: [createEmbed(`${config.emotes.error} Lỗi`, `Không thể trục xuất thành viên này.`, '#ff3333')], ephemeral: true });
            }
            break;

        case 'timeout':
            if (!checkPermissions(PermissionsBitField.Flags.ModerateMembers)) return;
            const timeoutUser = options.getUser('user');
            const minutes = options.getInteger('minutes');
            try {
                await guild.members.resolve(timeoutUser).timeout(minutes * 60 * 1000, 'Bị cách ly bởi bot.');
                interaction.reply({ embeds: [createEmbed(`${config.emotes.timeout} Đã Cách Ly`, `**${timeoutUser.tag}** đã bị cách ly trong ${minutes} phút.`)] });
            } catch (error) {
                interaction.reply({ embeds: [createEmbed(`${config.emotes.error} Lỗi`, `Không thể cách ly thành viên này.`, '#ff3333')], ephemeral: true });
            }
            break;

        case 'untimeout':
            if (!checkPermissions(PermissionsBitField.Flags.ModerateMembers)) return;
            const untimeoutUser = options.getUser('user');
            try {
                await guild.members.resolve(untimeoutUser).timeout(null);
                interaction.reply({ embeds: [createEmbed(`${config.emotes.untimeout} Đã Gỡ Cách Ly`, `Đã gỡ cách ly cho **${untimeoutUser.tag}**.`)] });
            } catch (error) {
                interaction.reply({ embeds: [createEmbed(`${config.emotes.error} Lỗi`, `Không thể gỡ cách ly.`, '#ff3333')], ephemeral: true });
            }
            break;
            
        case 'ping':
            const sent = await interaction.reply({ embeds: [createEmbed(`${config.emotes.ping} Đang kiểm tra...`, 'Vui lòng chờ.')], fetchReply: true });
            const botLatency = sent.createdTimestamp - interaction.createdTimestamp;
            const apiLatency = Math.round(client.ws.ping);
            const pingEmbed = createEmbed(`${config.emotes.ping} Pong!`, 
                `> ${config.emotes.latency} **Độ trễ Bot:** \`${botLatency}ms\`\n> ${config.emotes.api} **Độ trễ API:** \`${apiLatency}ms\``
            );
            interaction.editReply({ embeds: [pingEmbed] });
            break;
            
        case 'uptime':
            const uptime = process.uptime();
            const d = Math.floor(uptime / 86400);
            const h = Math.floor(uptime / 3600) % 24;
            const m = Math.floor(uptime / 60) % 60;
            const s = Math.floor(uptime) % 60;
            interaction.reply({ embeds: [createEmbed(`${config.emotes.uptime} Thời Gian Hoạt Động`, `> Bot đã hoạt động được: **${d}** ngày, **${h}** giờ, **${m}** phút, **${s}** giây.`)] });
            break;

        case 'serverinfo':
            const owner = await guild.fetchOwner();
            const embed = createEmbed(`${config.emotes.server} Thông Tin Server`, `**Tên Server:** ${guild.name} (\`${guild.id}\`)`)
                .setThumbnail(guild.iconURL({ dynamic: true }))
                .addFields(
                    { name: 'Chủ Sở Hữu', value: `> ${owner.user.tag}`, inline: true },
                    { name: 'Ngày Tạo', value: `> <t:${parseInt(guild.createdTimestamp / 1000)}:R>`, inline: true },
                    { name: 'Thành Viên', value: `> ${guild.memberCount}`, inline: true },
                    { name: 'Số Lượng Kênh', value: `> **Text:** ${guild.channels.cache.filter(c => c.type === 0).size}\n> **Voice:** ${guild.channels.cache.filter(c => c.type === 2).size}`, inline: true },
                    { name: 'Số Lượng Roles', value: `> ${guild.roles.cache.size}`, inline: true },
                    { name: 'Cấp Độ Boost', value: `> Cấp ${guild.premiumTier} (${guild.premiumSubscriptionCount} lượt boost)`, inline: true }
                );
            interaction.reply({ embeds: [embed] });
            break;

        case 'userinfo':
            const targetUser = options.getUser('user') || user;
            const memberInfo = await guild.members.fetch(targetUser.id);
            const userEmbed = createEmbed(`${config.emotes.user} Thông Tin Người Dùng`, `**Tên:** ${targetUser.username} (\`${targetUser.id}\`)`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'Biệt Danh', value: `> ${memberInfo.displayName}`, inline: true },
                    { name: 'Ngày Tham Gia', value: `> <t:${parseInt(memberInfo.joinedTimestamp / 1000)}:R>`, inline: true },
                    { name: 'Ngày Tạo TK', value: `> <t:${parseInt(targetUser.createdTimestamp / 1000)}:R>`, inline: true },
                    { name: 'Roles', value: `> ${memberInfo.roles.cache.map(r => r).join(', ')}` }
                );
            interaction.reply({ embeds: [userEmbed] });
            break;

        case 'status':
            const statusEmbed = createEmbed(`${config.emotes.status} Trạng Thái Bot`, `Đây là các thông số hiện tại của bot.`)
                .addFields(
                    { name: 'Phiên Bản', value: `> **Discord.js:** v${version}\n> **Node.js:** ${process.version}`, inline: true },
                    { name: 'Hệ Thống', value: `> **Hệ điều hành:** ${os.type()}\n> **CPU:** ${os.cpus()[0].model}`, inline: true },
                    { name: 'Bộ Nhớ', value: `> **Sử dụng:** ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB\n> **Tổng:** ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`, inline: true }
                );
            interaction.reply({ embeds: [statusEmbed] });
            break;
            
        case 'help':
            const helpEmbed = createEmbed(`${config.emotes.help} Bảng Lệnh`, `Sử dụng \`/\` để xem tất cả các lệnh có sẵn.`)
                .addFields(
                    { name: `${config.emotes.settings} Quản Lý`, value: '`/prefix`, `/autoreply`, `/autoreplylist`, `/autoreply-remove`' },
                    { name: `${config.emotes.moderation} Moderation`, value: '`/ban`, `/unban`, `/kick`, `/timeout`, `/untimeout`, `/mute`' },
                    { name: `${config.emotes.utility} Tiện Ích`, value: '`/ping`, `/uptime`, `/feedback`' },
                    { name: `${config.emotes.info} Thông Tin`, value: '`/serverinfo`, `/userinfo`, `/status`' }
                );
            interaction.reply({ embeds: [helpEmbed] });
            break;

        case 'feedback':
            try {
                // Kiểm tra cooldown
                const now = Date.now();
                const cooldownTime = 2 * 60 * 1000; // 2 phút
                const userCooldown = cooldowns.get(user.id);

                if (userCooldown && now - userCooldown < cooldownTime) {
                    const timeLeft = Math.ceil((cooldownTime - (now - userCooldown)) / 1000);
                    return interaction.reply({ 
                        embeds: [createEmbed(`${config.emotes.error} Chưa Thể Gửi`, `Vui lòng chờ ${timeLeft} giây trước khi gửi phản hồi mới.`, '#ff3333')],
                        ephemeral: true 
                    });
                }

                const comment = options.getString('comment');
                const images = [
                    options.getAttachment('image1'),
                    options.getAttachment('image2'),
                    options.getAttachment('image3'),
                    options.getAttachment('image4'),
                    options.getAttachment('image5')
                ].filter(Boolean).map(img => img.url);
                const feedbackChannelId = '1375449830222205039';
                
                const feedbackEmbeds = [];
                const mainEmbed = createEmbed(
                    comment,
                    null,
                    config.embedColor
                );
                if (images.length > 0) {
                    mainEmbed.setImage(images[0]); // Đặt hình ảnh đầu tiên làm hình chính
                }
                feedbackEmbeds.push(mainEmbed);

                // Tạo embed bổ sung cho các hình ảnh còn lại
                for (let i = 1; i < images.length; i++) {
                    const extraEmbed = new EmbedBuilder()
                        .setColor(config.embedColor)
                        .setImage(images[i]);
                    feedbackEmbeds.push(extraEmbed);
                }
                
                const feedbackChannel = await client.channels.fetch(feedbackChannelId);
                if (!feedbackChannel) {
                    return interaction.reply({ 
                        embeds: [createEmbed(`${config.emotes.error} Lỗi`, 'Không tìm thấy kênh phản hồi.', '#ff3333')],
                        ephemeral: true 
                    });
                }
                
                // Lưu thông tin feedback
                if (!feedbacks[user.id]) feedbacks[user.id] = [];
                feedbacks[user.id].push({
                    timestamp: now,
                    comment: comment,
                    images: images
                });
                saveData();
                
                // Cập nhật cooldown
                cooldowns.set(user.id, now);
                
                await feedbackChannel.send({ embeds: feedbackEmbeds }); // Gửi tất cả embeds
                interaction.reply({ 
                    embeds: [createEmbed(`${config.emotes.success} Phản Hồi Đã Gửi`, `Cảm ơn bạn đã gửi phản hồi với ${images.length} hình ảnh!`)],
                    ephemeral: true 
                });
            } catch (error) {
                console.error('Lỗi khi xử lý lệnh feedback:', error);
                interaction.reply({ 
                    embeds: [createEmbed(`${config.emotes.error} Lỗi`, 'Có lỗi xảy ra khi gửi phản hồi. Vui lòng thử lại sau.', '#ff3333')],
                    ephemeral: true 
                });
            }
            break;

        case 'mute':
            if (!checkPermissions(PermissionsBitField.Flags.ModerateMembers)) return;
            try {
                const muteUser = options.getUser('user');
                const duration = options.getString('duration');
                const muteRoleId = '1399056686769242233';

                const durationMs = parseDuration(duration);
                if (!durationMs) {
                    return interaction.reply({
                        embeds: [createEmbed(`${config.emotes.error} Lỗi`, 'Định dạng thời gian không hợp lệ. Vui lòng sử dụng dạng như 30s, 5m, 2h, 1d.', '#ff3333')],
                        ephemeral: true
                    });
                }

                const member = await guild.members.fetch(muteUser.id);
                const muteRole = guild.roles.cache.get(muteRoleId);
                if (!muteRole) {
                    return interaction.reply({
                        embeds: [createEmbed(`${config.emotes.error} Lỗi`, 'Không tìm thấy vai trò mute.', '#ff3333')],
                        ephemeral: true
                    });
                }

                await member.roles.add(muteRole, `Muted bởi ${user.tag} trong ${duration}`);
                interaction.reply({
                    embeds: [createEmbed(`${config.emotes.mute || '🔇'} Đã Mute Thành Viên`, `**${muteUser.tag}** đã bị mute trong ${duration}.`)]
                });

                setTimeout(async () => {
                    try {
                        await member.roles.remove(muteRole, 'Hết thời gian mute.');
                    } catch (error) {
                        console.error(`Lỗi khi gỡ vai trò mute cho ${muteUser.tag}:`, error);
                    }
                }, durationMs);
            } catch (error) {
                console.error('Lỗi khi xử lý lệnh mute:', error);
                interaction.reply({
                    embeds: [createEmbed(`${config.emotes.error} Lỗi`, 'Không thể mute thành viên này. Có thể họ có quyền cao hơn bot hoặc vai trò không hợp lệ.', '#ff3333')],
                    ephemeral: true
                });
            }
            break;
    }
});

client.login(config.token);
