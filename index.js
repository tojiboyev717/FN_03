const mineflayer = require('mineflayer');
const Vec3 = require('vec3');
require('./keep_alive');

const botUsername = 'FN_03';
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
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const baseReconnectDelay = 5000;

function init() {
    bot = mineflayer.createBot(botOption);
    reconnectAttempts = 0; // Reset reconnect attempts on new connection

    bot.on('messagestr', (message) => {
        if (message.startsWith("Skyblock »")) return;
        console.log(`[CHAT] ${message}`);

        if (message === "Server: Serverni kunlik restartiga 30 sekund qoldi") {
            console.log('[INFO] Server restarting, preparing to reconnect...');
            bot.quit("Server restart");
            return;
        }

        if (message.includes("register")) {
            console.log('[INFO] Registering bot...');
            bot.chat(`/register ${botPassword} ${botPassword}`);
        }
        if (message.includes("login")) {
            console.log('[INFO] Logging in bot...');
            bot.chat(`/login ${botPassword}`);
        }

        if (message.toLowerCase().includes("pay")) {
            shouldSendMoney = true;
            console.log('[INFO] Received pay command, checking balance...');
            bot.chat("/bal");
        }

        if (shouldSendMoney && message.includes("Balance: $")) {
            const balanceStr = message.match(/Balance: \$([\d,]+)/);
            if (!balanceStr || balanceStr.length < 2) {
                console.log('[ERROR] Failed to parse balance from message:', message);
                return;
            }
            const balance = parseInt(balanceStr[1].replace(/,/g, ""));
            if (balance > 0) {
                console.log(`[INFO] Sending ${balance} to ${admin}`);
                bot.chat(`/pay ${admin} ${balance}`);
                shouldSendMoney = false;
            } else {
                console.log('[INFO] Balance is 0, skipping payment.');
                shouldSendMoney = false;
            }
        }
    });

    bot.on("spawn", () => {
        console.log('[INFO] Bot spawned.');
        mcData = require("minecraft-data")(bot.version);

        // Periodic jumping to avoid AFK kick
        setInterval(() => {
            bot.setControlState("jump", true);
            setTimeout(() => bot.setControlState("jump", false), 500);
        }, 3 * 60 * 1000);

        // Warp to sell after spawn
        setTimeout(() => {
            bot.chat('/is warp sell');
        }, 1000);

        // Periodic honey withdrawal
        setInterval(() => {
            withdrawHoney(bot);
        }, 10 * 60 * 1000);
    });

    bot.on("whisper", (usernameSender, message) => {
        if (usernameSender === admin && message.startsWith("! ")) {
            const command = message.replace("! ", "");
            console.log(`[WHISPER] Executing command from ${usernameSender}: ${command}`);
            bot.chat(command);
        }
    });

    bot.on('windowOpen', async (window) => {
        console.log(`[INFO] Window opened: ${window.title}`);
        if (window.title.includes('Island Shop | Food')) {
            let honeyCount = 0;
            bot.inventory.slots.forEach(slot => {
                if (slot?.type && slot?.name === 'honey_bottle') {
                    honeyCount += slot.count;
                }
            });
            console.log(`[INFO] Found ${honeyCount} honey bottles in inventory.`);

            for (let i = 0; i < honeyCount; i++) {
                await new Promise(resolve => setTimeout(resolve, 50)); // Slower clicks ascendancy to avoid spam
                bot.simpleClick.rightMouse(21, 0, 0);
            }

            await new Promise(resolve => setTimeout(resolve, honeyCount * 50 + 100));
            await bot.closeWindow(window);
            bot.chat('/is warp afk');
            bot.chat('/is withdraw money 9999999999999999');
            bot.chat('/bal');
        } else {
            setTimeout(() => {
                bot.closeWindow(window);
            }, 19000);
        }
    });

    bot.on('end', (reason) => {
        if (!reconnecting) {
            console.log(`[INFO] Bot disconnected (Reason: ${reason}). Attempting to reconnect...`);
            reconnecting = true;
            scheduleReconnect();
        }
    });

    bot.on('error', (err) => {
        console.log(`[ERROR] Bot error: ${err.message}`);
    });

    async function withdrawHoney(bot) {
        console.log('[INFO] Starting honey withdrawal process...');
        bot.chat('/is warp sell');

        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for warp

        const chestPosition = new Vec3(5499, 90, -4377);
        const chestBlock = bot.blockAt(chestPosition);
        if (!chestBlock || chestBlock.name !== 'chest') {
            console.log("[ERROR] Chest not found or incorrect block at position:", chestPosition);
            bot.chat('/is warp afk'); // Return to AFK if chest fails
            return;
        }

        let attempts = 0;
        let chest = null;
        const maxAttempts = 3;

        while (!chest && attempts < maxAttempts) {
            try {
                chest = await bot.openChest(chestBlock);
            } catch (error) {
                console.log(`[ERROR] Failed to open chest: ${error.message}. Attempt ${attempts + 1}/${maxAttempts}`);
                attempts++;
                if (error.message.includes("timeout")) {
                    bot.quit("Chest timeout");
                    return;
                }
                await bot.waitForTicks(20);
            }
        }

        if (!chest) {
            console.log("[ERROR] Failed to open chest after maximum attempts.");
            bot.chat('/is warp sell');
            return;
        }

        function hasFreeSlot() {
            const emptySlots = bot.inventory.emptySlotCount();
            console.log(`[INFO] Available inventory slots: ${emptySlots}`);
            return emptySlots > 0;
        }

        for (let slot of chest.slots) {
            if (slot?.name === 'honey_bottle' && slot.count > 0) {
                while (slot.count > 0 && hasFreeSlot()) {
                    const countToWithdraw = Math.min(slot.count, 64); // Max stack size for honey bottles
                    try {
                        await chest.withdraw(slot.type, null, countToWithdraw);
                        console.log(`[INFO] Withdrew ${countToWithdraw} honey bottles.`);
                        slot.count -= countToWithdraw;
                    } catch (error) {
                        console.log(`[ERROR] Failed to withdraw honey: ${error.message}`);
                        break;
                    }
                    await new Promise(resolve => setTimeout(resolve, 50)); // Avoid spamming
                }
                if (!hasFreeSlot()) {
                    console.log('[ERROR] Inventory full, stopping withdrawal.');
                    break;
                }
            }
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        await chest.close();
        console.log('[INFO] Chest closed.');
        await new Promise(resolve => setTimeout(resolve, 1000));
        bot.chat('/is shop Food');
    }

    function scheduleReconnect() {
        if (reconnectAttempts >= maxReconnectAttempts) {
            console.log('[ERROR] Max reconnect attempts reached. Stopping.');
            return;
        }
        const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts); // Exponential backoff
        console.log(`[INFO] Scheduling reconnect attempt ${reconnectAttempts + 1} in ${delay / 1000} seconds...`);
        setTimeout(() => {
            reconnectBot();
        }, delay);
        reconnectAttempts++;
    }

    function reconnectBot() {
        reconnecting = false;
        console.log("[INFO] Reconnecting bot...");
        init();
    }
}

init();
