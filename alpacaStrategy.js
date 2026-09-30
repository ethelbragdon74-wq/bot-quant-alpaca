import http from 'http';
import axios from 'axios';
import { SMA, EMA, RSI, ATR } from 'technicalindicators';

// --- CREDENCIALES SEGURAS DESDE LA NUBE ---
const API_KEY = process.env.APCA_API_KEY_ID;
const API_SECRET = process.env.APCA_API_SECRET_KEY;
const BASE_URL = process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets';
const DATA_URL = 'https://data.alpaca.markets/v2';

// --- CONFIGURACIÓN DE PARÁMETROS V5.3 ---
const PARAMS = {
    symbol: 'AAPL',
    longitudMA: 50,
    longitudRSI: 15,
    sobreventaRSI: 20,
    longitudATR: 2,
    multATR_SL: 2.2,
    multATR_TP: 2.5,
    hardSLPuntos: 8.0,
    longitudEMAMacro: 100,
    usarFiltroTendencia: true
};

// --- SERVIDOR HTTP (PARA UPTIMEROBOT) ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('🤖 [MVP Quant V5.3] Bot activo en Render');
}).listen(PORT, () => console.log(`🌐 Servidor web activo en puerto ${PORT}`));

// --- MOTOR CUANTITATIVO ---
async function runQuantV53() {
    if (!API_KEY || !API_SECRET) {
        console.error("❌ ERROR CRÍTICO: Faltan las API Keys en Render.");
        return;
    }

    try {
        console.log(`\n🤖 [${new Date().toISOString()}] Escaneando ${PARAMS.symbol} (5Min)...`);
        const response = await axios.get(`${DATA_URL}/stocks/bars`, {
            headers: { 'APCA-API-KEY-ID': API_KEY, 'APCA-API-SECRET-KEY': API_SECRET },
            params: { symbols: PARAMS.symbol, timeframe: '5Min', limit: 300 }
        });

        const bars = response.data.bars ? response.data.bars[PARAMS.symbol] : null;
        if (!bars || bars.length === 0) return console.log(`⚠️ Mercado cerrado o sin datos.`);

        const closes = bars.map(b => b.c), highs = bars.map(b => b.h), lows = bars.map(b => b.l);
        const lastClose = closes[closes.length - 1];

        const smaValues = SMA.calculate({ period: PARAMS.longitudMA, values: closes });
        const emaMacroValues = EMA.calculate({ period: PARAMS.longitudEMAMacro, values: closes });
        const rsiValues = RSI.calculate({ period: PARAMS.longitudRSI, values: closes });
        const atrValues = ATR.calculate({ period: PARAMS.longitudATR, high: highs, low: lows, close: closes });

        if (!smaValues.length || !emaMacroValues.length || !rsiValues.length || !atrValues.length) return;

        const lastSMA = smaValues[smaValues.length - 1], lastEMAMacro = emaMacroValues[emaMacroValues.length - 1];
        const lastRSI = rsiValues[rsiValues.length - 1], lastATR = atrValues[atrValues.length - 1];

        console.log(`📊 Precio: $${lastClose.toFixed(2)} | RSI: ${lastRSI.toFixed(2)}`);

        if (lastClose < lastSMA && lastRSI < PARAMS.sobreventaRSI && (PARAMS.usarFiltroTendencia ? lastClose > lastEMAMacro : true)) {
            console.log("🚨 ¡SEÑAL DE COMPRA! Ejecutando orden...");
            await executeQuantOrder(PARAMS.symbol, lastClose, lastATR);
        } else {
            console.log("⏳ Condiciones no cumplidas. Sistema en espera.");
        }
    } catch (error) { console.error("❌ Error en ejecución:", error.message); }
}

async function executeQuantOrder(symbol, entryPrice, atrVal) {
    try {
        const slPrecio = Math.max(entryPrice - (atrVal * PARAMS.multATR_SL), entryPrice - PARAMS.hardSLPuntos);
        const tpPrecio = entryPrice + (atrVal * PARAMS.multATR_TP);
        const orderData = { symbol, qty: 1, side: 'buy', type: 'market', time_in_force: 'gtc', order_class: 'bracket', take_profit: { limit_price: Number(tpPrecio.toFixed(2)) }, stop_loss: { stop_price: Number(slPrecio.toFixed(2)) } };
        
        await axios.post(`${BASE_URL}/v2/orders`, orderData, {
            headers: { 'APCA-API-KEY-ID': API_KEY, 'APCA-API-SECRET-KEY': API_SECRET, 'Content-Type': 'application/json' }
        });
        console.log(`✅ ORDEN BRACKET EJECUTADA. TP: $${tpPrecio.toFixed(2)} | SL: $${slPrecio.toFixed(2)}`);
    } catch (error) { console.error("❌ Error enviando orden:", error.message); }
}

runQuantV53();
setInterval(runQuantV53, 5 * 60 * 1000);