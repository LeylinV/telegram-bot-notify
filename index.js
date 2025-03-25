const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error('Ошибка: Токен бота не найден в переменных окружения!');
    console.log('Текущие переменные:', process.env); // Для дебага
}

console.log('Бот запускается с токеном:', token.slice(0, 5) + '...'); // Логируем часть токена для проверки

const bot = new TelegramBot(token, { polling: true, request: {
    agentOptions: {
        keepAlive: true,
        family: 4
    },
    url: " https://api.telegram.org ",
}});

const motivations = [
    "Ты можешь больше, чем думаешь! 💪",
    "Каждый маленький шаг ведет к большой цели! 🚀",
    "Ты на правильном пути, не останавливайся! 🌟",
    "Помни, даже 5 минут могут изменить твой день! ⏳",
    "Ты сильнее, чем кажется! 💥",
    "Каждый день — это новый шанс стать лучше! 🌈",
    "Ты делаешь это ради себя, продолжай! ❤️",
    "Маленькие шаги приводят к большим результатам! 🏆",
    "Ты ближе к цели, чем был вчера! 🎯",
    "Ты справишься, я в тебя верю! 🌟"
];

// Путь к файлу с данными
const DATA_FILE = path.join(__dirname, 'userData.json');

// Загрузка данных при старте
function loadUserData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
            return JSON.parse(rawData);
        }
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
    }
    return {}; // Если файла нет или ошибка — вернём пустой объект
}

// Сохранение данных при изменении
function saveUserData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    console.log('Файл userData.json обновлён!'); // Логируем
    console.log(JSON.stringify(data, null, 2))
}

// Инициализация userState
const userState = loadUserData();

// Модифицируем функцию confirmCompletion
function confirmCompletion(chatId) {
    if (!userState[chatId]) {
        userState[chatId] = { stopped: false, streak: 0, completedToday: false };
    }

    if (userState[chatId].completedToday) {
        bot.sendMessage(chatId, `Ты уже подтверждал выполнение задачи сегодня! Твой текущий стрик: ${userState[chatId].streak}`);
        return;
    }
    
    userState[chatId].stopped = true;
    userState[chatId].completedToday = true;
    userState[chatId].streak = (userState[chatId].streak || 0) + 1;
    
    saveUserData(userState); // Сохраняем изменения!
    
    bot.sendMessage(chatId, `Молодец! Сейчас твой стрик составляет: ${userState[chatId].streak}`);
}

// Функция для отправки сообщения с вопросом
function sendQuestion(chatId) {
    const randomMotivation = motivations[Math.floor(Math.random() * motivations.length)];
    const message = `${randomMotivation}\n\nСделал(а) ли ты сегодня свои 5 минут?`;

    bot.sendMessage(chatId, message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Да', callback_data: 'yes' }],
                [{ text: 'Нет', callback_data: 'no' }]
            ],
            keyboard: [[{ text: '✅ Я сделал(а) 5 минут' }]], // Добавляем обычную кнопку
            resize_keyboard: true,
            one_time_keyboard: true
        }
    });
}

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeMessage = `
Привет! Я твой помощник, который будет напоминать тебе о твоих 5 минутах каждый день с 15:00 до 24:00 (по Уфе).

Если ты выполнишь задачу, нажми "Да", и я перестану напоминать тебе на сегодня. Если нет, я напомню тебе через час.

Ты также можешь в любой момент подтвердить выполнение задачи кнопкой ниже или командой /done.

Начнем? 😊
    `;

    if (!userState[chatId]) {
        userState[chatId] = { stopped: false, streak: 0, completedToday: false };
    }

    bot.sendMessage(chatId, welcomeMessage, {
        reply_markup: {
            keyboard: [[{ text: '✅ Я сделал(а) 5 минут' }]], // Добавляем обычную кнопку
            resize_keyboard: true,
            one_time_keyboard: true
        }
    });
});

// Обработчик команды /done
bot.onText(/\/done/, (msg) => {
    const chatId = msg.chat.id;
    confirmCompletion(chatId);
});

// Обработчик нажатия обычной кнопки
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (text === '✅ Я сделал(а) 5 минут') {
        confirmCompletion(chatId);
    }
});

bot.on("polling_error", (msg) => console.log(msg));

// Обработчик callback-запросов от inline-кнопок
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'yes') {
        confirmCompletion(chatId);
    } else if (data === 'no') {
        userState[chatId].stopped = false;
        bot.sendMessage(chatId, 'Я напомню тебе через час.');
    }
});

// Запуск cron-задачи каждый час с 15:00 до 24:00
cron.schedule('0 * 15-23 * * *', () => {
    Object.keys(userState).forEach(chatId => {
        if (!userState[chatId].stopped) {
            sendQuestion(chatId);
        }
    });
}, {
    timezone: "Asia/Yekaterinburg"
});

// Задача для сброса стрика в 00:00, если задача не выполнена
cron.schedule('0 0 * * *', () => {
    Object.keys(userState).forEach(chatId => {
        if (!userState[chatId].completedToday) {
            userState[chatId].streak = 0;
            bot.sendMessage(chatId, 'Ты не выполнил задачу сегодня. Твой стрик сброшен.');
        }
        userState[chatId].completedToday = false;
        userState[chatId].stopped = false;
    });
    saveUserData(userState);
}, {
    timezone: "Asia/Yekaterinburg"
});

console.log('Бот запущен...');