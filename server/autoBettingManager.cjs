const BettingStrategy = require('./bettingStrategy.cjs');

/**
 * Gerenciador de apostas automatizadas - VERSÃO CORRIGIDA
 * Controla martingale, cálculo preciso de lucros e gestão de risco
 */
class AutoBettingManager {
    constructor(database, blazeManager) {
        this.db = database;
        this.blazeManager = blazeManager;
        this.strategy = new BettingStrategy(database);
        this.userSessions = new Map(); // userId -> session data
        this.isProcessing = new Map(); // userId -> boolean
        this.pendingBets = new Map(); // userId -> bet data
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
            consecutiveWins: 0,
            totalBets: 0,
            wins: 0,
            losses: 0,
            startTime: new Date(),
            lastBetTime: null,
            lastBetAmount: 0,
            status: 'active',
            dailyTarget: initialBalance * (validatedConfig.profit_target / 100),
            stopLossLimit: initialBalance * (validatedConfig.stop_loss / 100),
            maxConsecutiveLosses: 0,
            totalWagered: 0,
            totalWon: 0,
            bestStreak: 0,
            worstStreak: 0
        };

        this.userSessions.set(userId, session);
        
        // Salvar configuração no banco
        await this.db.saveBotConfig(userId, {
            ...validatedConfig,
            is_active: true,
            auto_bet: true
        });

        // Criar sessão no banco
        await this.db.createAutoBettingSession(userId, initialBalance);

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
            session.endTime = new Date();
            
            // Atualizar sessão no banco
            await this.updateSessionInDatabase(userId, session);
            
            this.userSessions.delete(userId);
            this.pendingBets.delete(userId);
            
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

            // Atualizar saldo atual
            const balanceResult = await this.blazeManager.getUserBalance(userId);
            if (balanceResult.success) {
                session.currentBalance = balanceResult.balance.balance;
            }

            // Analisar e decidir
            const decision = await this.strategy.analyzeAndDecide(
                blazeResults, 
                session.config,
                {
                    consecutiveLosses: session.consecutiveLosses,
                    currentBalance: session.currentBalance,
                    dailyProfit: session.dailyProfit
                }
            );
            
            if (!decision.shouldBet) {
                return { processed: false, reason: decision.reason };
            }

            // Verificar se tem saldo suficiente
            if (session.currentBalance < decision.amount) {
                return { processed: false, reason: 'Saldo insuficiente' };
            }

            // Executar aposta
            const betResult = await this.blazeManager.placeBet(userId, decision.color, decision.amount);
            
            if (betResult.success) {
                // Atualizar sessão
                session.lastBetTime = Date.now();
                session.lastBetAmount = decision.amount;
                session.totalBets++;
                session.totalWagered += decision.amount;
                
                // Armazenar aposta pendente para calcular resultado depois
                this.pendingBets.set(userId, {
                    betId: betResult.betId,
                    amount: decision.amount,
                    color: decision.color,
                    timestamp: Date.now(),
                    confidence: decision.confidence
                });
                
                console.log(`🎯 Aposta automática executada para usuário ${userId}:`, {
                    color: decision.color,
                    amount: decision.amount,
                    confidence: decision.confidence,
                    consecutiveLosses: session.consecutiveLosses
                });

                return {
                    processed: true,
                    betId: betResult.betId,
                    color: decision.color,
                    amount: decision.amount,
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
     * NOVO MÉTODO: Processa resultado de uma rodada da Blaze
     */
    async processBlazeResult(blazeResult) {
        console.log(`🎰 Processando resultado da Blaze: ${blazeResult.color} (${blazeResult.roll})`);
        
        for (const [userId, pendingBet] of this.pendingBets.entries()) {
            const session = this.userSessions.get(userId);
            if (!session) continue;

            try {
                // Calcular resultado da aposta
                const betResult = this.strategy.calculateBetProfit(
                    pendingBet.amount,
                    pendingBet.color,
                    blazeResult.color,
                    blazeResult.roll
                );

                // Atualizar sessão
                if (betResult.won) {
                    session.wins++;
                    session.consecutiveWins++;
                    session.consecutiveLosses = 0;
                    session.bestStreak = Math.max(session.bestStreak, session.consecutiveWins);
                    console.log(`✅ Usuário ${userId} GANHOU: R$ ${betResult.profit.toFixed(2)}`);
                } else {
                    session.losses++;
                    session.consecutiveLosses++;
                    session.consecutiveWins = 0;
                    session.maxConsecutiveLosses = Math.max(session.maxConsecutiveLosses, session.consecutiveLosses);
                    session.worstStreak = Math.max(session.worstStreak, session.consecutiveLosses);
                    console.log(`❌ Usuário ${userId} PERDEU: R$ ${Math.abs(betResult.profit).toFixed(2)}`);
                }

                session.dailyProfit += betResult.profit;
                session.currentBalance += betResult.profit;
                session.totalWon += Math.max(0, betResult.profit);

                // Atualizar aposta no banco
                await this.db.updateBetResult(
                    pendingBet.betId,
                    betResult.won ? 'won' : 'lost',
                    blazeResult.color,
                    betResult.profit
                );

                // Atualizar sessão no banco
                await this.updateSessionInDatabase(userId, session);

                console.log(`📊 Estatísticas atualizadas para usuário ${userId}:`, {
                    dailyProfit: session.dailyProfit,
                    consecutiveLosses: session.consecutiveLosses,
                    winRate: ((session.wins / session.totalBets) * 100).toFixed(1) + '%'
                });

            } catch (error) {
                console.error(`❌ Erro ao processar resultado para usuário ${userId}:`, error.message);
            }
        }

        // Limpar apostas pendentes
        this.pendingBets.clear();
    }

    /**
     * NOVO MÉTODO: Atualiza sessão no banco de dados
     */
    async updateSessionInDatabase(userId, session) {
        try {
            // Buscar a sessão mais recente do usuário
            const sessions = await this.db.getUserAutoBettingSessions(userId, 1);
            if (sessions.length > 0) {
                const sessionId = sessions[0].id;
                await this.db.updateAutoBettingSession(sessionId, {
                    final_balance: session.currentBalance,
                    daily_profit: session.dailyProfit,
                    total_bets: session.totalBets,
                    wins: session.wins,
                    losses: session.losses,
                    end_time: session.endTime || null,
                    status: session.status
                });
            }
        } catch (error) {
            console.error(`❌ Erro ao atualizar sessão no banco para usuário ${userId}:`, error.message);
        }
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

        // Verificar limite de perdas consecutivas (segurança extra)
        if (session.consecutiveLosses >= 6) {
            console.log(`🚨 Muitas perdas consecutivas para usuário ${session.userId}: ${session.consecutiveLosses}`);
            return true;
        }

        // Verificar se perdeu mais de 50% do saldo inicial
        if (session.currentBalance < session.initialBalance * 0.5) {
            console.log(`⚠️ Saldo muito baixo para usuário ${session.userId}: R$ ${session.currentBalance.toFixed(2)}`);
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
        session.endTime = new Date();
        
        // Atualizar no banco
        await this.updateSessionInDatabase(userId, session);
        
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
            session.initialBalance = session.currentBalance; // Novo saldo base
            session.dailyProfit = 0;
            session.consecutiveLosses = 0;
            session.consecutiveWins = 0;
            session.totalBets = 0;
            session.wins = 0;
            session.losses = 0;
            session.totalWagered = 0;
            session.totalWon = 0;
            session.status = 'active';
            session.startTime = new Date();
            
            // Recalcular metas baseado no saldo atual
            session.dailyTarget = session.currentBalance * (session.config.profit_target / 100);
            session.stopLossLimit = session.currentBalance * (session.config.stop_loss / 100);
            
            // Criar nova sessão no banco
            await this.db.createAutoBettingSession(userId, session.currentBalance);
            
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
                consecutiveWins: session.consecutiveWins,
                maxConsecutiveLosses: session.maxConsecutiveLosses,
                timeActive: Date.now() - session.startTime.getTime(),
                nextAction: session.status === 'paused_until_tomorrow' ? 'Aguardando próximo dia' : 'Ativo',
                currentBalance: session.currentBalance,
                totalWagered: session.totalWagered,
                totalWon: session.totalWon,
                bestStreak: session.bestStreak,
                worstStreak: session.worstStreak
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

        const winRate = session.totalBets > 0 ? (session.wins / session.totalBets * 100).toFixed(1) : 0;
        const profitPercent = ((session.dailyProfit / session.initialBalance) * 100).toFixed(2);
        const timeActive = Date.now() - session.startTime.getTime();
        const targetProgress = ((session.dailyProfit / session.dailyTarget) * 100).toFixed(1);
        const stopLossProgress = ((Math.abs(session.dailyProfit) / session.stopLossLimit) * 100).toFixed(1);

        return {
            ...session,
            winRate,
            profitPercent,
            timeActive,
            targetProgress,
            stopLossProgress,
            roi: session.totalWagered > 0 ? ((session.dailyProfit / session.totalWagered) * 100).toFixed(2) : 0,
            avgBetAmount: session.totalBets > 0 ? (session.totalWagered / session.totalBets).toFixed(2) : 0,
            avgWin: session.wins > 0 ? (session.totalWon / session.wins).toFixed(2) : 0
        };
    }
}

module.exports = AutoBettingManager;