const { blazeAPI } = require('./blaze-roulette-api.cjs');

/**
 * Sistema de estratégia de apostas automatizadas - VERSÃO CORRIGIDA
 * Agora aposta na cor MAIS FREQUENTE (mais provável) ao invés da menos frequente
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
     * @returns {Promise<Object>} Decisão de aposta
     */
    async analyzeAndDecide(blazeResults, userConfig) {
        try {
            console.log('🧠 Iniciando análise para decisão de aposta...');
            
            // Obter análise da API
            const apiAnalysis = await this.getAPIAnalysis();
            
            // Analisar padrões locais
            const localAnalysis = this.analyzeLocalPatterns(blazeResults);
            
            // Combinar análises - LÓGICA CORRIGIDA
            const decision = this.makeDecision(apiAnalysis, localAnalysis, userConfig);
            
            console.log('📊 Análise completa:', {
                shouldBet: decision.shouldBet,
                color: decision.color,
                confidence: decision.confidence,
                reason: decision.reason
            });
            
            return decision;
            
        } catch (error) {
            console.error('❌ Erro na análise:', error.message);
            return {
                shouldBet: false,
                color: null,
                confidence: 0,
                reason: 'Erro na análise: ' + error.message
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
     * ===================================================================
     * MÉTODO PRINCIPAL CORRIGIDO - APOSTA NA COR MAIS FREQUENTE
     * ===================================================================
     */
    makeDecision(apiAnalysis, localAnalysis, userConfig) {
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

        // ✅ ALGORITMO CORRIGIDO - Apostar na cor mais provável
        const scores = { red: 0, black: 0, white: 0 };
        
        // =====================================
        // 1. ANÁLISE DA API (peso 50%) - CORRIGIDA
        // =====================================
        if (apiAnalysis.colorsInfo) {
            console.log('📊 Dados da API:', apiAnalysis.colorsInfo);
            
            apiAnalysis.colorsInfo.forEach(colorInfo => {
                const colorName = this.mapColorName(colorInfo.color);
                if (colorName) {
                    // ✅ CORREÇÃO: Favorecer cores com MAIOR frequência (mais prováveis)
                    // Quanto maior a porcentagem, maior a pontuação
                    const points = colorInfo.percent * 0.5;
                    scores[colorName] += points;
                    
                    console.log(`🎯 ${colorName.toUpperCase()}: ${colorInfo.percent}% -> +${points.toFixed(1)} pontos`);
                }
            });
        }

        // =====================================
        // 2. MOMENTUM POSITIVO (peso 25%) - CORRIGIDA  
        // =====================================
        const momentum = localAnalysis.trends.momentum;
        const totalMomentum = Object.values(momentum).reduce((a, b) => a + b, 0);
        
        if (totalMomentum > 0) {
            Object.keys(momentum).forEach(color => {
                // ✅ CORREÇÃO: Favorecer cores com MAIOR momentum (estão "quentes")
                const momentumPercent = (momentum[color] / totalMomentum) * 100;
                const points = momentumPercent * 0.25;
                scores[color] += points;
                
                console.log(`🔥 Momentum ${color.toUpperCase()}: ${momentumPercent.toFixed(1)}% -> +${points.toFixed(1)} pontos`);
            });
        }

        // =====================================
        // 3. PADRÕES ANTI-STREAK (peso 15%) - MANTIDA
        // =====================================
        localAnalysis.patterns.forEach(pattern => {
            if (pattern.type === 'long_streak' && pattern.count >= 4) {
                // Esta lógica está correta: após streak longo, apostar na cor oposta
                const oppositeColors = this.getOppositeColors(pattern.color);
                const points = pattern.count * 0.075; // 15% / 2 cores opostas
                
                oppositeColors.forEach(color => {
                    scores[color] += points;
                });
                
                console.log(`🔄 Anti-streak: ${pattern.color} teve ${pattern.count} seguidas -> +${points.toFixed(1)} pontos para opostas`);
            }
        });

        // =====================================
        // 4. TENDÊNCIA RECENTE (peso 10%) - CORRIGIDA
        // =====================================
        const recent5 = localAnalysis.trends.recent5;
        Object.keys(recent5).forEach(color => {
            // ✅ CORREÇÃO: Favorecer cores que apareceram MAIS nos últimos 5 (tendência quente)
            const points = recent5[color].percent * 0.1;
            scores[color] += points;
            
            console.log(`📈 Tendência ${color.toUpperCase()}: ${recent5[color].percent.toFixed(1)}% recente -> +${points.toFixed(1)} pontos`);
        });

        // =====================================
        // 5. FILTRO DE REALIDADE - NOVO
        // =====================================
        // Penalizar branco drasticamente (só 7% de chance real na Blaze)
        if (scores.white > 0) {
            const originalWhite = scores.white;
            scores.white *= 0.2; // Reduz pontuação do branco em 80%
            console.log(`⚪ PENALIDADE BRANCO: ${originalWhite.toFixed(1)} -> ${scores.white.toFixed(1)} pontos (-80%)`);
        }

        // =====================================
        // 6. DECISÃO FINAL
        // =====================================
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
        const maxPossibleScore = 90; // 50% + 25% + 15% + 10% (ajustado)
        const confidence = Math.min(bestScore / maxPossibleScore, 1);

        // =====================================
        // 7. CRITÉRIOS DE CONFIANÇA - AJUSTADOS
        // =====================================
        const minConfidenceByColor = {
            red: 0.30,      // 30% confiança mínima para vermelho
            black: 0.30,    // 30% confiança mínima para preto  
            white: 0.65     // 65% confiança mínima para branco (muito mais rigoroso)
        };

        const requiredConfidence = minConfidenceByColor[bestColor];

        if (confidence >= requiredConfidence && bestScore > 8) {
            decision.shouldBet = true;
            decision.color = this.mapColorToBet(bestColor);
            decision.confidence = confidence;
            decision.reason = `✅ ${bestColor.toUpperCase()} selecionado com ${(confidence * 100).toFixed(1)}% de confiança (${bestScore.toFixed(1)} pontos)`;
            
            console.log(`🎯 ✅ DECISÃO: APOSTAR EM ${decision.color.toUpperCase()}!`);
            console.log(`   Confiança: ${(confidence * 100).toFixed(1)}% (precisa ${requiredConfidence * 100}%)`);
            console.log(`   Pontuação: ${bestScore.toFixed(1)} pontos`);
        } else {
            decision.reason = `❌ Confiança insuficiente: ${bestColor.toUpperCase()} com ${(confidence * 100).toFixed(1)}% (precisa ${(requiredConfidence * 100).toFixed(0)}%) ou pontuação baixa (${bestScore.toFixed(1)})`;
            console.log(`⏸️ ❌ SEM APOSTA: ${decision.reason}`);
        }

        console.log('🔍 === FIM DA ANÁLISE ===\n');
        return decision;
    }

    /**
     * Mapeia nome da cor da API para nome padrão - MELHORADO
     */
    mapColorName(apiColor) {
        const mapping = {
            // Formato numérico da API Blaze
            0: 'white',    // Branco (número 0)
            1: 'red',      // Vermelho (números 1-7)  
            2: 'black',    // Preto (números 8-14)
            
            // Formato string
            'white': 'white',
            'red': 'red', 
            'black': 'black',
            
            // Possíveis variações em português
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
     * Calcula o valor da aposta baseado na estratégia - MELHORADO
     */
    calculateBetAmount(baseAmount, confidence, consecutiveLosses = 0, color = 'red') {
        let amount = baseAmount;
        
        // =====================================
        // 1. MARTINGALE MODIFICADO (mais conservador)
        // =====================================
        if (consecutiveLosses > 0) {
            // Máximo 3x o valor base (mais conservador que antes)
            const multiplier = Math.min(Math.pow(1.5, consecutiveLosses), 3);
            amount = baseAmount * multiplier;
            console.log(`💰 Ajuste por perdas (${consecutiveLosses}): ${baseAmount} -> ${amount.toFixed(2)} (x${multiplier.toFixed(1)})`);
        }
        
        // =====================================
        // 2. AJUSTE POR CONFIANÇA
        // =====================================
        // Quanto maior a confiança, maior a aposta (dentro do limite)
        const confidenceMultiplier = 0.7 + (confidence * 0.6); // 0.7x a 1.3x
        amount = amount * confidenceMultiplier;
        console.log(`🎯 Ajuste por confiança (${(confidence * 100).toFixed(1)}%): x${confidenceMultiplier.toFixed(2)} = ${amount.toFixed(2)}`);
        
        // =====================================
        // 3. AJUSTE POR COR (NOVO)
        // =====================================
        const colorMultipliers = {
            'vermelho': 1.0,    // Aposta normal para vermelho
            'preto': 1.0,       // Aposta normal para preto
            'branco': 0.4       // Aposta muito menor para branco (mais arriscado)
        };
        
        const colorMultiplier = colorMultipliers[color] || 1.0;
        amount = amount * colorMultiplier;
        
        if (colorMultiplier !== 1.0) {
            console.log(`🎨 Ajuste por cor (${color}): x${colorMultiplier} = ${amount.toFixed(2)}`);
        }
        
        // =====================================
        // 4. LIMITES E ARREDONDAMENTO
        // =====================================
        amount = Math.max(0.01, amount); // Mínimo R$ 0,01
        amount = Math.min(amount, baseAmount * 4); // Máximo 4x o valor base
        
        const finalAmount = Math.round(amount * 100) / 100;
        console.log(`💵 Valor final da aposta: R$ ${finalAmount}`);
        
        return finalAmount;
    }
}

module.exports = BettingStrategy;