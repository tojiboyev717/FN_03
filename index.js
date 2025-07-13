const mineflayer = require('mineflayer');
const Vec3 = require('vec3');
require('./keep_alive');

const botUsername = 'FN_06';
const botPassword = 'fort54321';
const admin = 'Umid';
const botOption = {
    host: 'hypixel.uz',
    port: 25565,
    username: botUsername,
    password: botPassword,
    version: '1.20.1',
};

let shouldSendMoney = false;
let mcData;
let reconnecting = false;
let bot;

function init() {
    bot = mineflayer.createBot(botOption);

    bot.on('messagestr', (message) => {
        if (message.startsWith("Skyblock »")) return;
        console.log(message);

        if (message === "Server: Serverni kunlik restartiga 30 sekund qoldi") {
            bot.quit("reconnect");
        }

        if (message.includes("register")) {
            bot.chat(`/register ${botPassword} ${botPassword}`);
        }
        if (message.includes("login")) {
            bot.chat(`/login ${botPassword}`);
        }

        if (message.toLowerCase().includes("pay")) {
            shouldSendMoney = true;
            bot.chat("/bal");
        }

        if (shouldSendMoney && message.includes("Balance: $")) {
            let balanceStr = message.match(/Balance: \$([\d,]+)/);
            if (!balanceStr || balanceStr.length < 2) return;
            let balance = parseInt(balanceStr[1].replace(/,/g, ""));
            if (balance > 0) {
                bot.chat(`/pay ${admin} ${balance}`);
                shouldSendMoney = false;
            }
        }
    });

    bot.on("spawn", () => {
        mcData = require("minecraft-data")(bot.version);

        setInterval(() => {
            bot.setControlState("jump", true);
            setTimeout(() => bot.setControlState("jump", false), 500);
        }, 3 * 60 * 1000);

        setTimeout(() => {
            bot.chat('/is warp sell');
        }, 1000);

        setInterval(() => {
            withdrawHoney(bot);
        }, 10 * 60 * 1000);
    });

    bot.on("whisper", (usernameSender, message) => {
        if (usernameSender === admin && message.startsWith("! ")) {
            const command = message.replace("! ", "");
            bot.chat(command);
        }
    });

    bot.on('windowOpen', async (window) => {
        setTimeout(() => {
            bot.closeWindow(window);
        }, 19000);
        if (window.title.includes('Island Shop | Food')) {
            let honeyCount = 0;
            bot.inventory.slots.forEach(slot => {
                if (slot?.type && slot?.name === 'honey_bottle') {
                    honeyCount += slot.count;
                }
            });
            for (let i = 0; i < honeyCount; i++) {
                setTimeout(() => {
                    bot.simpleClick.rightMouse(21, 0, 0);
                }, 20);
            }
            setTimeout(async () => {
                await bot.closeWindow(window);
                bot.chat('/is warp afk');
                bot.chat('/is withdraw money 9999999999999999');
                bot.chat('/bal');
            }, honeyCount * 20 + 100);
            return;
        }
    });

    bot.on('end', () => {
        if (!reconnecting) {
            console.log('❗ Bot disconnected, attempting to reconnect in 5 seconds...');
            reconnecting = true;
            setTimeout(() => {
                reconnectBot();
            }, 5000);
        }
    });

    bot.on('error', (err) => {
        console.log("⚠️ Bot error:", err.message);
    });

    async function withdrawHoney(bot) {
        bot.chat('/is warp sell');

        setTimeout(async () => {
            const chestPosition = new Vec3(5525, 90, -4377);
            const chestBlock = bot.blockAt(chestPosition);
            if (!chestBlock || chestBlock.name !== 'chest') {
                console.log("❌ Chest bloki topilmadi yoki noto‘g‘ri blok.");
                return;
            }

            let attempts = 0;
            let chest = null;
            const maxAttempts = 3;

            while (!chest && attempts < maxAttempts) {
                try {
                    chest = await bot.openChest(chestBlock);
                } catch (error) {
                    console.log(`Error opening chest: ${error}. Retrying...`);
                    attempts++;
                    if (error.message.includes("timeout")) {
                        bot.quit("reconnect");
                        return;
                    }
                    await bot.waitForTicks(20);
                }
            }

            if (!chest) {
                console.log("Failed to open chest after multiple attempts.");
                return;
            }

            function hasFreeSlot() {
                return bot.inventory.emptySlotCount() > 0;
            }

            for (let slot of chest.slots) {
                if (slot?.name === 'honey_bottle' && slot.count > 0) {
                    while (slot.count > 0 && hasFreeSlot()) {
                        let countToWithdraw = Math.min(slot.count, bot.inventory.itemLimit - slot.count);
                        try {
                            await chest.withdraw(slot.type, null, countToWithdraw);
                            slot.count -= countToWithdraw;
                        } catch (error) {
                            break;
                        }
                    }
                    if (!hasFreeSlot()) break;
                }
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
            await chest.close();
            await new Promise(resolve => setTimeout(resolve, 1000));
            bot.chat('/is shop Food');
        }, 500);
    }
}

// Auto reconnect
function reconnectBot() {
    reconnecting = false;
    console.log("🔄 Reconnecting bot...");
    init();
}

init();
