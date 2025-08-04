const { blazeAPI } = require('./blaze-roulette-api.cjs');

/**
 * Sistema de estratégia de apostas automatizadas - VERSÃO CORRIGIDA COM MARTINGALE
 * Implementa martingale progressivo e cálculo preciso de lucros
 */
class BettingStrategy {
    constructor(database) {
        this.db = database;
        this.analysisCache = new Map();
        this.cacheTimeout = 30000; // 30 segundos
    }

    /**
     * Analisa os dados e decide se deve apostar e em qual cor
     * @param {Array} blazeResults - Últimos resultados da Blaze
     * @param {Object} userConfig - Configurações do usuário
     * @param {Object} sessionData - Dados da sessão atual
     * @returns {Promise<Object>} Decisão de aposta
     */
    async analyzeAndDecide(blazeResults, userConfig, sessionData = {}) {
        try {
            console.log('🧠 Iniciando análise para decisão de aposta...');
            
            // Obter análise da API
            const apiAnalysis = await this.getAPIAnalysis();
            
            // Analisar padrões locais
            const localAnalysis = this.analyzeLocalPatterns(blazeResults);
            
            // Combinar análises
            const decision = this.makeDecision(apiAnalysis, localAnalysis, userConfig, sessionData);
            
            console.log('📊 Análise completa:', {
                shouldBet: decision.shouldBet,
                color: decision.color,
                confidence: decision.confidence,
                reason: decision.reason,
                amount: decision.amount
            });
            
            return decision;
            
        } catch (error) {
            console.error('❌ Erro na análise:', error.message);
            return {
                shouldBet: false,
                color: null,
                confidence: 0,
                reason: 'Erro na análise: ' + error.message,
                amount: userConfig.bet_amount || 1.0
            };
        }
    }

    /**
     * Obtém análise da API da Blaze (com cache)
     */
    async getAPIAnalysis() {
        const cacheKey = 'api_analysis';
        const cached = this.analysisCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }

        try {
            const analysis = await blazeAPI.getHistoryAnalytics(50);
            this.analysisCache.set(cacheKey, {
                data: analysis,
                timestamp: Date.now()
            });
            return analysis;
        } catch (error) {
            console.error('❌ Erro ao obter análise da API:', error.message);
            return null;
        }
    }

    /**
     * Analisa padrões nos resultados locais
     */
    analyzeLocalPatterns(results) {
        if (!results || results.length < 10) {
            return {
                patterns: [],
                colorSequence: [],
                trends: {}
            };
        }

        const last20 = results.slice(0, 20);
        const colorCounts = { red: 0, black: 0, white: 0 };
        const colorSequence = [];
        
        // Contar cores e criar sequência
        last20.forEach(result => {
            colorCounts[result.color]++;
            colorSequence.push(result.color);
        });

        // Detectar padrões
        const patterns = this.detectPatterns(colorSequence);
        
        // Analisar tendências
        const trends = this.analyzeTrends(colorSequence);

        return {
            colorCounts,
            colorSequence,
            patterns,
            trends,
            totalAnalyzed: last20.length
        };
    }

    /**
     * Detecta padrões na sequência de cores
     */
    detectPatterns(sequence) {
        const patterns = [];
        
        // Padrão: Sequência longa de uma cor (mais de 3 seguidas)
        let currentStreak = { color: sequence[0], count: 1 };
        
        for (let i = 1; i < sequence.length; i++) {
            if (sequence[i] === currentStreak.color) {
                currentStreak.count++;
            } else {
                if (currentStreak.count >= 3) {
                    patterns.push({
                        type: 'long_streak',
                        color: currentStreak.color,
                        count: currentStreak.count,
                        significance: currentStreak.count >= 5 ? 'high' : 'medium'
                    });
                }
                currentStreak = { color: sequence[i], count: 1 };
            }
        }

        // Padrão: Alternância frequente
        let alternations = 0;
        for (let i = 1; i < sequence.length; i++) {
            if (sequence[i] !== sequence[i-1]) {
                alternations++;
            }
        }
        
        if (alternations / sequence.length > 0.7) {
            patterns.push({
                type: 'high_alternation',
                rate: alternations / sequence.length,
                significance: 'medium'
            });
        }

        return patterns;
    }

    /**
     * Analisa tendências nas cores
     */
    analyzeTrends(sequence) {
        const recent5 = sequence.slice(0, 5);
        const recent10 = sequence.slice(0, 10);
        
        const trends = {
            recent5: this.getColorDistribution(recent5),
            recent10: this.getColorDistribution(recent10),
            momentum: this.calculateMomentum(sequence)
        };

        return trends;
    }

    /**
     * Calcula distribuição de cores
     */
    getColorDistribution(sequence) {
        const counts = { red: 0, black: 0, white: 0 };
        sequence.forEach(color => counts[color]++);
        
        const total = sequence.length;
        return {
            red: { count: counts.red, percent: (counts.red / total) * 100 },
            black: { count: counts.black, percent: (counts.black / total) * 100 },
            white: { count: counts.white, percent: (counts.white / total) * 100 }
        };
    }

    /**
     * Calcula momentum das cores
     */
    calculateMomentum(sequence) {
        const weights = [5, 4, 3, 2, 1]; // Pesos decrescentes para resultados mais recentes
        const momentum = { red: 0, black: 0, white: 0 };
        
        for (let i = 0; i < Math.min(5, sequence.length); i++) {
            momentum[sequence[i]] += weights[i];
        }
        
        return momentum;
    }

    /**
     * MÉTODO PRINCIPAL CORRIGIDO - APOSTA NA COR MAIS FREQUENTE
     */
    makeDecision(apiAnalysis, localAnalysis, userConfig, sessionData = {}) {
        const decision = {
            shouldBet: false,
            color: null,
            confidence: 0,
            reason: '',
            amount: userConfig.bet_amount || 1.0
        };

        // Se não temos dados suficientes, não apostar
        if (!apiAnalysis || !localAnalysis.colorSequence.length) {
            decision.reason = 'Dados insuficientes para análise';
            return decision;
        }

        console.log('🔍 === INICIANDO ANÁLISE CORRIGIDA ===');

        // Algoritmo de análise
        const scores = { red: 0, black: 0, white: 0 };
        
        // 1. ANÁLISE DA API (peso 50%)
        if (apiAnalysis.colorsInfo) {
            console.log('📊 Dados da API:', apiAnalysis.colorsInfo);
            
            apiAnalysis.colorsInfo.forEach(colorInfo => {
                const colorName = this.mapColorName(colorInfo.color);
                if (colorName) {
                    const points = colorInfo.percent * 0.5;
                    scores[colorName] += points;
                    console.log(`🎯 ${colorName.toUpperCase()}: ${colorInfo.percent}% -> +${points.toFixed(1)} pontos`);
                }
            });
        }

        // 2. MOMENTUM POSITIVO (peso 25%)
        const momentum = localAnalysis.trends.momentum;
        const totalMomentum = Object.values(momentum).reduce((a, b) => a + b, 0);
        
        if (totalMomentum > 0) {
            Object.keys(momentum).forEach(color => {
                const momentumPercent = (momentum[color] / totalMomentum) * 100;
                const points = momentumPercent * 0.25;
                scores[color] += points;
                console.log(`🔥 Momentum ${color.toUpperCase()}: ${momentumPercent.toFixed(1)}% -> +${points.toFixed(1)} pontos`);
            });
        }

        // 3. PADRÕES ANTI-STREAK (peso 15%)
        localAnalysis.patterns.forEach(pattern => {
            if (pattern.type === 'long_streak' && pattern.count >= 4) {
                const oppositeColors = this.getOppositeColors(pattern.color);
                const points = pattern.count * 0.075;
                
                oppositeColors.forEach(color => {
                    scores[color] += points;
                });
                
                console.log(`🔄 Anti-streak: ${pattern.color} teve ${pattern.count} seguidas -> +${points.toFixed(1)} pontos para opostas`);
            }
        });

        // 4. TENDÊNCIA RECENTE (peso 10%)
        const recent5 = localAnalysis.trends.recent5;
        Object.keys(recent5).forEach(color => {
            const points = recent5[color].percent * 0.1;
            scores[color] += points;
            console.log(`📈 Tendência ${color.toUpperCase()}: ${recent5[color].percent.toFixed(1)}% recente -> +${points.toFixed(1)} pontos`);
        });

        // 5. FILTRO DE REALIDADE
        if (scores.white > 0) {
            const originalWhite = scores.white;
            scores.white *= 0.2;
            console.log(`⚪ PENALIDADE BRANCO: ${originalWhite.toFixed(1)} -> ${scores.white.toFixed(1)} pontos (-80%)`);
        }

        // 6. DECISÃO FINAL
        console.log('🏆 PONTUAÇÃO FINAL:', {
            '🔴 VERMELHO': scores.red.toFixed(2),
            '⚫ PRETO': scores.black.toFixed(2),
            '⚪ BRANCO': scores.white.toFixed(2)
        });

        // Encontrar a melhor cor
        const bestColor = Object.keys(scores).reduce((a, b) => 
            scores[a] > scores[b] ? a : b
        );
        
        const bestScore = scores[bestColor];
        const maxPossibleScore = 90;
        const confidence = Math.min(bestScore / maxPossibleScore, 1);

        // 7. CRITÉRIOS DE CONFIANÇA
        const minConfidenceByColor = {
            red: 0.30,
            black: 0.30,
            white: 0.65
        };

        const requiredConfidence = minConfidenceByColor[bestColor];

        if (confidence >= requiredConfidence && bestScore > 8) {
            decision.shouldBet = true;
            decision.color = this.mapColorToBet(bestColor);
            decision.confidence = confidence;
            decision.reason = `✅ ${bestColor.toUpperCase()} selecionado com ${(confidence * 100).toFixed(1)}% de confiança (${bestScore.toFixed(1)} pontos)`;
            
            // CALCULAR VALOR DA APOSTA COM MARTINGALE
            decision.amount = this.calculateBetAmountWithMartingale(
                userConfig.bet_amount,
                confidence,
                sessionData.consecutiveLosses || 0,
                bestColor,
                sessionData.currentBalance || 100
            );
            
            console.log(`🎯 ✅ DECISÃO: APOSTAR EM ${decision.color.toUpperCase()}!`);
            console.log(`   Confiança: ${(confidence * 100).toFixed(1)}% (precisa ${requiredConfidence * 100}%)`);
            console.log(`   Pontuação: ${bestScore.toFixed(1)} pontos`);
            console.log(`   Valor da aposta: R$ ${decision.amount.toFixed(2)}`);
        } else {
            decision.reason = `❌ Confiança insuficiente: ${bestColor.toUpperCase()} com ${(confidence * 100).toFixed(1)}% (precisa ${(requiredConfidence * 100).toFixed(0)}%) ou pontuação baixa (${bestScore.toFixed(1)})`;
            console.log(`⏸️ ❌ SEM APOSTA: ${decision.reason}`);
        }

        console.log('🔍 === FIM DA ANÁLISE ===\n');
        return decision;
    }

    /**
     * NOVO MÉTODO: Calcula valor da aposta com Martingale progressivo
     */
    calculateBetAmountWithMartingale(baseAmount, confidence, consecutiveLosses = 0, color = 'red', currentBalance = 100) {
        let amount = baseAmount;
        
        console.log(`💰 === CÁLCULO MARTINGALE ===`);
        console.log(`   Valor base: R$ ${baseAmount}`);
        console.log(`   Perdas consecutivas: ${consecutiveLosses}`);
        console.log(`   Saldo atual: R$ ${currentBalance.toFixed(2)}`);
        
        // 1. MARTINGALE PROGRESSIVO
        if (consecutiveLosses > 0) {
            // Multiplicadores progressivos mais agressivos
            const multipliers = [1, 2.2, 4.8, 10.5, 23.0, 50.0];
            const multiplier = multipliers[Math.min(consecutiveLosses, multipliers.length - 1)];
            amount = baseAmount * multiplier;
            console.log(`   Multiplicador Martingale: x${multiplier} = R$ ${amount.toFixed(2)}`);
        }
        
        // 2. AJUSTE POR CONFIANÇA
        const confidenceMultiplier = 0.8 + (confidence * 0.4); // 0.8x a 1.2x
        amount = amount * confidenceMultiplier;
        console.log(`   Ajuste confiança (${(confidence * 100).toFixed(1)}%): x${confidenceMultiplier.toFixed(2)} = R$ ${amount.toFixed(2)}`);
        
        // 3. AJUSTE POR COR
        const colorMultipliers = {
            'vermelho': 1.0,
            'preto': 1.0,
            'branco': 0.3  // Muito menor para branco
        };
        
        const colorMultiplier = colorMultipliers[color] || 1.0;
        amount = amount * colorMultiplier;
        
        if (colorMultiplier !== 1.0) {
            console.log(`   Ajuste cor (${color}): x${colorMultiplier} = R$ ${amount.toFixed(2)}`);
        }
        
        // 4. LIMITES DE SEGURANÇA
        const maxBetPercent = 0.15; // Máximo 15% do saldo
        const maxAllowedBet = currentBalance * maxBetPercent;
        
        if (amount > maxAllowedBet) {
            console.log(`   ⚠️ LIMITE DE SEGURANÇA: R$ ${amount.toFixed(2)} -> R$ ${maxAllowedBet.toFixed(2)} (15% do saldo)`);
            amount = maxAllowedBet;
        }
        
        // Mínimo e arredondamento
        amount = Math.max(0.01, amount);
        const finalAmount = Math.round(amount * 100) / 100;
        
        console.log(`   💵 VALOR FINAL: R$ ${finalAmount.toFixed(2)}`);
        console.log(`💰 === FIM CÁLCULO ===\n`);
        
        return finalAmount;
    }

    /**
     * Mapeia nome da cor da API para nome padrão
     */
    mapColorName(apiColor) {
        const mapping = {
            0: 'white',
            1: 'red',
            2: 'black',
            'white': 'white',
            'red': 'red', 
            'black': 'black',
            'branco': 'white',
            'vermelho': 'red',
            'preto': 'black'
        };
        
        const result = mapping[apiColor];
        if (!result) {
            console.warn(`⚠️ Cor desconhecida da API: ${apiColor}`);
        }
        
        return result;
    }

    /**
     * Mapeia cor para formato de aposta
     */
    mapColorToBet(color) {
        const mapping = {
            'red': 'vermelho',
            'black': 'preto',
            'white': 'branco'
        };
        return mapping[color] || color;
    }

    /**
     * Obtém cores opostas para estratégia anti-streak
     */
    getOppositeColors(color) {
        if (color === 'red') return ['black', 'white'];
        if (color === 'black') return ['red', 'white'];
        if (color === 'white') return ['red', 'black'];
        return ['red', 'black'];
    }

    /**
     * NOVO MÉTODO: Calcula lucro/prejuízo de uma aposta
     */
    calculateBetProfit(betAmount, betColor, resultColor, resultNumber) {
        console.log(`💰 === CÁLCULO DE LUCRO ===`);
        console.log(`   Aposta: R$ ${betAmount.toFixed(2)} em ${betColor}`);
        console.log(`   Resultado: ${resultColor} (${resultNumber})`);
        
        // Normalizar cores para comparação
        const normalizedBetColor = this.normalizeBetColor(betColor);
        const normalizedResultColor = this.normalizeBetColor(resultColor);
        
        let profit = 0;
        let won = false;
        
        if (normalizedBetColor === normalizedResultColor) {
            won = true;
            
            // Multiplicadores da Blaze
            if (normalizedResultColor === 'white') {
                profit = betAmount * 14; // 14x para branco
            } else {
                profit = betAmount * 2; // 2x para vermelho/preto
            }
            
            // Subtrair o valor apostado para obter lucro líquido
            profit = profit - betAmount;
            
            console.log(`   ✅ GANHOU! Multiplicador: ${normalizedResultColor === 'white' ? '14x' : '2x'}`);
        } else {
            won = false;
            profit = -betAmount; // Perde o valor apostado
            console.log(`   ❌ PERDEU! Prejuízo: R$ ${Math.abs(profit).toFixed(2)}`);
        }
        
        console.log(`   💵 LUCRO LÍQUIDO: R$ ${profit.toFixed(2)}`);
        console.log(`💰 === FIM CÁLCULO ===\n`);
        
        return {
            won,
            profit,
            multiplier: won ? (normalizedResultColor === 'white' ? 14 : 2) : 0
        };
    }

    /**
     * Normaliza cor para comparação
     */
    normalizeBetColor(color) {
        const normalized = color.toLowerCase();
        if (normalized.includes('vermelho') || normalized.includes('red')) return 'red';
        if (normalized.includes('preto') || normalized.includes('black')) return 'black';
        if (normalized.includes('branco') || normalized.includes('white')) return 'white';
        return normalized;
    }
}

module.exports = BettingStrategy;