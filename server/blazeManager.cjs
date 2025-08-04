const { BlazeAPI } = require('../src/api/BlazeAPI.cjs');

class BlazeManager {
    constructor(database) {
        this.db = database;
        this.userBots = new Map(); // userId -> BlazeAPI instance
        this.tokenRefreshInterval = 4 * 60 * 1000; // 4 minutos
        this.startTokenRefreshService();
    }

    async initializeUserBot(userId, accessToken, refreshToken) {
        try {
            console.log(`Inicializando bot para usuário ${userId}`);
            
            const api = new BlazeAPI();
            api.accessToken = accessToken;
            api.refreshToken = refreshToken;
            api.isLogged = true;
            api.lastAuthTime = new Date();

            // Testar se os tokens funcionam
            const balance = await api.getBalance();
            if (!balance) {
                throw new Error('Tokens inválidos');
            }

            // Salvar tokens no banco
            await this.db.saveTokens(userId, accessToken, refreshToken, api.sessionId);
            
            // Armazenar instância do bot
            this.userBots.set(userId, api);
            
            console.log(`Bot inicializado com sucesso para usuário ${userId}`);
            return { success: true, balance: balance[0] };
            
        } catch (error) {
            console.error(`Erro ao inicializar bot para usuário ${userId}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    async getUserBot(userId) {
        if (this.userBots.has(userId)) {
            return this.userBots.get(userId);
        }

        // Tentar carregar tokens do banco
        const tokens = await this.db.getActiveTokens(userId);
        if (tokens) {
            const api = new BlazeAPI();
            api.accessToken = tokens.access_token;
            api.refreshToken = tokens.refresh_token;
            api.sessionId = tokens.session_id;
            api.isLogged = true;
            api.lastAuthTime = new Date(tokens.updated_at);

            this.userBots.set(userId, api);
            return api;
        }

        return null;
    }

    async getUserBalance(userId) {
        try {
            const api = await this.getUserBot(userId);
            if (!api) {
                return { success: false, error: 'Bot não inicializado' };
            }

            const balance = await api.getBalance();
            return { success: true, balance: balance[0] };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async placeBet(userId, color, amount) {
        try {
            const api = await this.getUserBot(userId);
            if (!api) {
                return { success: false, error: 'Bot não inicializado' };
            }

            // Criar registro da aposta no banco
            const betId = await this.db.createBet(userId, amount, color);
            
            // Fazer a aposta na Blaze
            const result = await api.doubleBets(color, amount);
            
            if (result.result) {
                console.log(`Aposta realizada com sucesso para usuário ${userId}`);
                return { 
                    success: true, 
                    betId: betId,
                    blazeResponse: result.object 
                };
            } else {
                // Atualizar status da aposta como falhou
                await this.db.updateBetResult(betId, 'failed', null, 0);
                return { success: false, error: result.message };
            }
        } catch (error) {
            console.error(`Erro ao fazer aposta para usuário ${userId}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    async getLastDoubles(userId) {
        try {
            const api = await this.getUserBot(userId);
            if (!api) {
                return { success: false, error: 'Bot não inicializado' };
            }

            const doubles = await api.getLastDoubles();
            return { success: true, doubles };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getCurrentGame(userId) {
        try {
            const api = await this.getUserBot(userId);
            if (!api) {
                return { success: false, error: 'Bot não inicializado' };
            }

            const response = await api.getRoulettes();
            return { success: true, game: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Serviço de atualização automática de tokens
    startTokenRefreshService() {
        setInterval(async () => {
            console.log('Iniciando atualização automática de tokens...');
            
            for (const [userId, api] of this.userBots.entries()) {
                try {
                    const now = new Date();
                    const timeSinceAuth = now - api.lastAuthTime;
                    
                    // Se passou mais de 4 minutos, renovar token
                    if (timeSinceAuth > this.tokenRefreshInterval) {
                        console.log(`Renovando token para usuário ${userId}`);
                        
                        const refreshResult = await api.refreshAuth();
                        
                        if (!refreshResult.error) {
                            // Atualizar tokens no banco
                            const tokens = await this.db.getActiveTokens(userId);
                            if (tokens) {
                                await this.db.updateTokens(
                                    tokens.id,
                                    api.accessToken,
                                    api.refreshToken,
                                    api.sessionId
                                );
                            }
                            console.log(`Token renovado com sucesso para usuário ${userId}`);
                        } else {
                            console.error(`Erro ao renovar token para usuário ${userId}:`, refreshResult.error);
                            // Remover bot com problema
                            this.userBots.delete(userId);
                        }
                    }
                } catch (error) {
                    console.error(`Erro na renovação automática para usuário ${userId}:`, error.message);
                    this.userBots.delete(userId);
                }
            }
        }, 60000); // Verificar a cada minuto
    }

    // Remover bot do usuário
    removeUserBot(userId) {
        if (this.userBots.has(userId)) {
            this.userBots.delete(userId);
            console.log(`Bot removido para usuário ${userId}`);
        }
    }

    // Obter status de todos os bots
    getAllBotsStatus() {
        const status = {};
        for (const [userId, api] of this.userBots.entries()) {
            status[userId] = {
                isActive: api.isLogged,
                lastAuth: api.lastAuthTime,
                hasTokens: !!(api.accessToken && api.refreshToken)
            };
        }
        return status;
    }
}

module.exports = BlazeManager;