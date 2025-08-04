const WebSocket = require('ws');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

class BlazeRouletteMonitor extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.wsUrl = 'wss://api-gaming.blaze.bet.br/replication/?EIO=3&transport=websocket';
        this.csvFile = options.csvFile || 'dataset.csv';
        this.autoReconnect = options.autoReconnect !== false;
        this.reconnectDelay = options.reconnectDelay || 5000;
        this.database = options.database || null;
        
        this.ws = null;
        this.isConnected = false;
        this.shouldClose = false;
        this.lastUpdatedAt = null;
        this.currentState = {
            status: 'disconnected',
            color: null,
            roll: null,
            id: null,
            created_at: null,
            updated_at: null
        };
        
        // Inicializar CSV se não existir
        this.initCSV();
    }

    initCSV() {
        if (!fs.existsSync(this.csvFile)) {
            const header = 'id,created_at,color,roll\n';
            fs.writeFileSync(this.csvFile, header);
        }
    }

    getColor(number) {
        const colors = {
            0: 'white',
            1: 'red',
            2: 'black'
        };
        return colors[number] || null;
    }

    convertToSaoPauloTime(utcTimeStr) {
        const utcTime = new Date(utcTimeStr);
        const saoPauloTime = new Date(utcTime.getTime() - (3 * 60 * 60 * 1000)); // UTC-3
        return saoPauloTime.toISOString().replace('T', ' ').substring(0, 19);
    }

    saveToCSV(data) {
        try {
            const csvLine = `${data.id},${data.created_at},${data.color},${data.roll}\n`;
            fs.appendFileSync(this.csvFile, csvLine);
        } catch (error) {
            this.emit('error', { type: 'csv_save_error', error });
        }
    }

    async saveToDatabase(data) {
        if (this.database) {
            try {
                await this.database.saveBlazeResult(data.id, data.color, data.roll, data.created_at);
            } catch (error) {
                this.emit('error', { type: 'database_save_error', error });
            }
        }
    }
    connect() {
        if (this.isConnected) {
            return;
        }

        console.log('Conectando ao WebSocket da Blaze...');
        
        this.ws = new WebSocket(this.wsUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
                'Origin': 'https://blaze.bet.br'
            }
        });

        this.ws.on('open', () => {
            console.log('WebSocket conectado');
            this.isConnected = true;
            this.currentState.status = 'connected';
            
            // Inscrever na sala da roleta
            const subscribeMsg = '420["cmd",{"id":"subscribe","payload":{"room":"double_room_1"}}]';
            this.ws.send(subscribeMsg);
            console.log('Inscrito na sala double_room_1');
            
            // Iniciar ping para manter conexão viva
            this.startPing();
            
            this.emit('connected');
        });

        this.ws.on('message', (data) => {
            this.handleMessage(data.toString());
        });

        this.ws.on('error', (error) => {
            console.error('Erro no WebSocket:', error);
            this.emit('error', { type: 'websocket_error', error });
        });

        this.ws.on('close', (code, reason) => {
            console.log(`WebSocket fechado: ${code} - ${reason}`);
            this.isConnected = false;
            this.currentState.status = 'disconnected';
            
            this.emit('disconnected', { code, reason });
            
            if (this.autoReconnect && !this.shouldClose) {
                console.log(`Reconectando em ${this.reconnectDelay}ms...`);
                setTimeout(() => this.connect(), this.reconnectDelay);
            }
        });
    }

    handleMessage(message) {
        try {
            // Emitir mensagem bruta para debug se necessário
            this.emit('raw_message', message);

            if (message.startsWith('42')) {
                const jsonData = JSON.parse(message.substring(2));
                
                if (Array.isArray(jsonData) && 
                    jsonData.length > 1 && 
                    jsonData[0] === 'data' && 
                    jsonData[1]?.id === 'double.tick') {
                    
                    const payload = jsonData[1].payload;
                    this.processDoubleTickPayload(payload);
                }
            }
        } catch (error) {
            this.emit('error', { type: 'message_parse_error', error, message });
        }
    }

    processDoubleTickPayload(payload) {
        // Emitir payload bruto para debug
        this.emit('payload', payload);

        // Atualizar estado atual
        this.currentState = {
            ...this.currentState,
            status: payload.status,
            color: this.getColor(payload.color),
            roll: payload.roll,
            id: payload.id,
            created_at: payload.created_at,
            updated_at: payload.updated_at
        };

        if (payload.status === 'rolling' && payload.color !== null) {
            // Verificar se é um novo resultado
            if (this.lastUpdatedAt !== payload.updated_at) {
                this.lastUpdatedAt = payload.updated_at;

                const result = {
                    id: payload.id,
                    color: this.getColor(payload.color),
                    roll: payload.roll,
                    created_at: this.convertToSaoPauloTime(payload.created_at)
                };

                // Salvar no CSV
                this.saveToCSV(result);

                // Salvar no banco de dados se disponível
                this.saveToDatabase(result);

                console.log(`Novo resultado: ${result.color} (${result.roll}) - ${result.created_at}`);
                
                // Emitir eventos específicos
                this.emit('new_result', result);
                this.emit('state_change', this.currentState);
            }
        } else if (payload.status === 'waiting') {
            console.log('Aguardando próxima rodada...');
            this.emit('waiting');
            this.emit('state_change', this.currentState);
        } else if (payload.status === 'rolling') {
            this.emit('rolling');
            this.emit('state_change', this.currentState);
        }
    }

    startPing() {
        this.pingInterval = setInterval(() => {
            if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send('2');
                console.log('Ping enviado');
            }
        }, 20000);
    }

    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    disconnect() {
        this.shouldClose = true;
        this.stopPing();
        
        if (this.ws && this.isConnected) {
            this.ws.close();
        }
    }

    // Métodos para o bot usar
    getCurrentState() {
        return { ...this.currentState };
    }

    isWaiting() {
        return this.currentState.status === 'waiting';
    }

    isRolling() {
        return this.currentState.status === 'rolling';
    }

    getLastResult() {
        if (this.currentState.roll !== null) {
            return {
                color: this.currentState.color,
                roll: this.currentState.roll,
                id: this.currentState.id,
                created_at: this.currentState.created_at
            };
        }
        return null;
    }
}

module.exports = BlazeRouletteMonitor;