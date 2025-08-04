const BettingStrategy = require('./bettingStrategy.cjs');

/**
 * Gerenciador de apostas automatizadas
 * Controla o fluxo diário, stop loss, meta de lucro e execução das apostas
 */
class AutoBettingManager {
    constructor(database, blazeManager) {
        this.db = database;
        this.blazeManager = blazeManager;
        this.strategy = new BettingStrategy(database);
        this.userSessions = new Map(); // userId -> session data
        this.isProcessing = new Map(); // userId -> boolean
    }

    /**
     * Inicia ou para o bot automático para um usuário
     */
    async toggleAutoBetting(userId, config) {
        try {
            if (this.userSessions.has(userId)) {
                // Parar bot
                await this.stopAutoBetting(userId);
                return { success: true, message: 'Bot automático parado' };
            } else {
                // Iniciar bot
                await this.startAutoBetting(userId, config);
                return { success: true, message: 'Bot automático iniciado' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Inicia apostas automáticas para um usuário
     */
    async startAutoBetting(userId, config) {
        console.log(`🤖 Iniciando bot automático para usuário ${userId}`);
        
        // Validar configuração
        const validatedConfig = this.validateConfig(config);
        
        // Verificar se o usuário tem bot ativo
        const userBot = await this.blazeManager.getUserBot(userId);
        if (!userBot) {
            throw new Error('Bot do usuário não está inicializado');
        }

        // Obter saldo inicial
        const balanceResult = await this.blazeManager.getUserBalance(userId);
        if (!balanceResult.success) {
            throw new Error('Não foi possível obter saldo inicial');
        }

        const initialBalance = balanceResult.balance.balance;
        
        // Criar sessão do usuário
        const session = {
            userId,
            config: validatedConfig,
            initialBalance,
            currentBalance: initialBalance,
            dailyProfit: 0,
            consecutiveLosses: 0,
            totalBets: 0,
            wins: 0,
            losses: 0,
            startTime: new Date(),
            lastBetTime: null,
            status: 'active',
            dailyTarget: initialBalance * (validatedConfig.profit_target / 100),
            stopLossLimit: initialBalance * (validatedConfig.stop_loss / 100)
        };

        this.userSessions.set(userId, session);
        
        // Salvar configuração no banco
        await this.db.saveBotConfig(userId, {
            ...validatedConfig,
            is_active: true,
            auto_bet: true
        });

        console.log(`✅ Bot automático iniciado para usuário ${userId}`, {
            initialBalance,
            dailyTarget: session.dailyTarget,
            stopLossLimit: session.stopLossLimit
        });
    }

    /**
     * Para apostas automáticas para um usuário
     */
    async stopAutoBetting(userId) {
        console.log(`🛑 Parando bot automático para usuário ${userId}`);
        
        const session = this.userSessions.get(userId);
        if (session) {
            session.status = 'stopped';
            this.userSessions.delete(userId);
            
            // Atualizar configuração no banco
            const config = await this.db.getBotConfig(userId);
            if (config) {
                await this.db.saveBotConfig(userId, {
                    ...config,
                    is_active: false,
                    auto_bet: false
                });
            }
        }
    }

    /**
     * Processa uma oportunidade de aposta para um usuário
     */
    async processAutoBet(userId, blazeResults) {
        const session = this.userSessions.get(userId);
        if (!session || session.status !== 'active') {
            return { processed: false, reason: 'Sessão inativa' };
        }

        // Evitar processamento simultâneo
        if (this.isProcessing.get(userId)) {
            return { processed: false, reason: 'Já processando' };
        }

        this.isProcessing.set(userId, true);

        try {
            // Verificar se deve parar por hoje
            if (await this.shouldStopForToday(session)) {
                await this.pauseUntilTomorrow(userId);
                return { processed: false, reason: 'Meta atingida ou stop loss - pausado até amanhã' };
            }

            // Verificar cooldown entre apostas (mínimo 30 segundos)
            if (session.lastBetTime && Date.now() - session.lastBetTime < 30000) {
                return { processed: false, reason: 'Cooldown entre apostas' };
            }

            // Analisar e decidir
            const decision = await this.strategy.analyzeAndDecide(blazeResults, session.config);
            
            if (!decision.shouldBet) {
                return { processed: false, reason: decision.reason };
            }

            // Calcular valor da aposta
            const betAmount = this.strategy.calculateBetAmount(
                session.config.bet_amount,
                decision.confidence,
                session.consecutiveLosses
            );

            // Verificar se tem saldo suficiente
            const balanceResult = await this.blazeManager.getUserBalance(userId);
            if (!balanceResult.success || balanceResult.balance.balance < betAmount) {
                return { processed: false, reason: 'Saldo insuficiente' };
            }

            // Executar aposta
            const betResult = await this.blazeManager.placeBet(userId, decision.color, betAmount);
            
            if (betResult.success) {
                // Atualizar sessão
                session.lastBetTime = Date.now();
                session.totalBets++;
                
                console.log(`🎯 Aposta automática executada para usuário ${userId}:`, {
                    color: decision.color,
                    amount: betAmount,
                    confidence: decision.confidence
                });

                return {
                    processed: true,
                    betId: betResult.betId,
                    color: decision.color,
                    amount: betAmount,
                    confidence: decision.confidence,
                    reason: decision.reason
                };
            } else {
                return { processed: false, reason: betResult.error };
            }

        } catch (error) {
            console.error(`❌ Erro no processamento automático para usuário ${userId}:`, error.message);
            return { processed: false, reason: error.message };
        } finally {
            this.isProcessing.set(userId, false);
        }
    }

    /**
     * Atualiza resultado de uma aposta
     */
    async updateBetResult(userId, betId, won, profit) {
        const session = this.userSessions.get(userId);
        if (!session) return;

        if (won) {
            session.wins++;
            session.consecutiveLosses = 0;
        } else {
            session.losses++;
            session.consecutiveLosses++;
        }

        session.dailyProfit += profit;
        session.currentBalance += profit;

        console.log(`📊 Resultado atualizado para usuário ${userId}:`, {
            won,
            profit,
            dailyProfit: session.dailyProfit,
            consecutiveLosses: session.consecutiveLosses
        });
    }

    /**
     * Verifica se deve parar as apostas por hoje
     */
    async shouldStopForToday(session) {
        // Verificar meta de lucro
        if (session.dailyProfit >= session.dailyTarget) {
            console.log(`🎉 Meta diária atingida para usuário ${session.userId}: R$ ${session.dailyProfit.toFixed(2)}`);
            return true;
        }

        // Verificar stop loss
        if (session.dailyProfit <= -session.stopLossLimit) {
            console.log(`🛑 Stop loss atingido para usuário ${session.userId}: R$ ${session.dailyProfit.toFixed(2)}`);
            return true;
        }

        return false;
    }

    /**
     * Pausa o bot até o próximo dia
     */
    async pauseUntilTomorrow(userId) {
        const session = this.userSessions.get(userId);
        if (!session) return;

        session.status = 'paused_until_tomorrow';
        
        // Calcular tempo até meia-noite
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        
        const timeUntilTomorrow = tomorrow.getTime() - now.getTime();
        
        console.log(`⏰ Bot pausado até amanhã para usuário ${userId}. Retoma em ${Math.round(timeUntilTomorrow / 1000 / 60 / 60)} horas`);
        
        // Agendar reativação
        setTimeout(() => {
            this.resumeAfterPause(userId);
        }, timeUntilTomorrow);
    }

    /**
     * Retoma o bot após pausa diária
     */
    async resumeAfterPause(userId) {
        const session = this.userSessions.get(userId);
        if (!session || session.status !== 'paused_until_tomorrow') return;

        // Reset diário
        const balanceResult = await this.blazeManager.getUserBalance(userId);
        if (balanceResult.success) {
            session.currentBalance = balanceResult.balance.balance;
            session.dailyProfit = 0;
            session.consecutiveLosses = 0;
            session.status = 'active';
            session.startTime = new Date();
            
            // Recalcular metas baseado no saldo atual
            session.dailyTarget = session.currentBalance * (session.config.profit_target / 100);
            session.stopLossLimit = session.currentBalance * (session.config.stop_loss / 100);
            
            console.log(`🌅 Bot retomado para usuário ${userId} - Novo dia iniciado`, {
                currentBalance: session.currentBalance,
                dailyTarget: session.dailyTarget,
                stopLossLimit: session.stopLossLimit
            });
        }
    }

    /**
     * Valida e normaliza configuração do usuário
     */
    validateConfig(config) {
        return {
            bet_amount: Math.max(0.01, parseFloat(config.bet_amount) || 1.0),
            profit_target: Math.min(100, Math.max(1, parseFloat(config.profit_target) || 30)),
            stop_loss: Math.min(100, Math.max(1, parseFloat(config.stop_loss) || 100)),
            strategy: config.strategy || 'intelligent_analysis',
            min_confidence: Math.min(1, Math.max(0.1, parseFloat(config.min_confidence) || 0.6))
        };
    }

    /**
     * Obtém status de todos os bots automáticos
     */
    getAllAutoBotsStatus() {
        const status = {};
        
        for (const [userId, session] of this.userSessions.entries()) {
            status[userId] = {
                status: session.status,
                dailyProfit: session.dailyProfit,
                totalBets: session.totalBets,
                wins: session.wins,
                losses: session.losses,
                winRate: session.totalBets > 0 ? (session.wins / session.totalBets * 100).toFixed(1) : 0,
                consecutiveLosses: session.consecutiveLosses,
                timeActive: Date.now() - session.startTime.getTime(),
                nextAction: session.status === 'paused_until_tomorrow' ? 'Aguardando próximo dia' : 'Ativo'
            };
        }
        
        return status;
    }

    /**
     * Obtém estatísticas detalhadas de um usuário
     */
    getUserStats(userId) {
        const session = this.userSessions.get(userId);
        if (!session) return null;

        return {
            ...session,
            winRate: session.totalBets > 0 ? (session.wins / session.totalBets * 100).toFixed(1) : 0,
            profitPercent: ((session.dailyProfit / session.initialBalance) * 100).toFixed(2),
            timeActive: Date.now() - session.startTime.getTime(),
            targetProgress: ((session.dailyProfit / session.dailyTarget) * 100).toFixed(1),
            stopLossProgress: ((Math.abs(session.dailyProfit) / session.stopLossLimit) * 100).toFixed(1)
        };
    }
}

module.exports = AutoBettingManager;