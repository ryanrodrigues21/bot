const axios = require('axios');

/**
 * Módulo para comunicação com a API da Blaze Roulette
 * Responsável por obter dados analíticos dos jogos de roleta
 */
class BlazeRouletteAPI {
    constructor() {
        this.baseURL = 'https://blaze.bet.br/api/singleplayer-originals/originals/roulette_games';
        this.defaultHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
            'Referer': 'https://blaze.bet.br/',
            'Origin': 'https://blaze.bet.br'
        };
    }

    /**
     * Obtém dados analíticos dos últimos N jogos da roleta
     * @param {number} n - Número de jogos para análise (padrão: 25)
     * @returns {Promise<Object>} Dados analíticos da API
     */
    async getHistoryAnalytics(n = 25) {
        try {
            const url = `${this.baseURL}/history_analytics`;
            const params = { n };

            console.log(`📊 Buscando análise dos últimos ${n} jogos...`);

            const response = await axios.get(url, {
                params,
                headers: this.defaultHeaders,
                timeout: 10000 // 10 segundos
            });

            if (response.status === 200 && response.data) {
                console.log('✅ Dados obtidos com sucesso!');
                return this.formatAnalyticsData(response.data);
            } else {
                throw new Error(`Status HTTP inválido: ${response.status}`);
            }

        } catch (error) {
            console.error('❌ Erro ao obter dados da API:', error.message);
            throw new Error(`Falha na comunicação com a API: ${error.message}`);
        }
    }

    /**
     * Formata e valida os dados recebidos da API
     * @param {Object} rawData - Dados brutos da API
     * @returns {Object} Dados formatados e validados
     */
    formatAnalyticsData(rawData) {
        const {
            high_roll,
            low_roll,
            high_roll_percent,
            low_roll_percent,
            even_roll_percent,
            odd_roll_percent,
            rolls_info,
            colors_info
        } = rawData;

        // Validação básica dos dados
        if (!rolls_info || !Array.isArray(rolls_info)) {
            throw new Error('Dados de rolls_info inválidos');
        }

        if (!colors_info || !Array.isArray(colors_info)) {
            throw new Error('Dados de colors_info inválidos');
        }

        return {
            summary: {
                highRoll: high_roll,
                lowRoll: low_roll,
                highRollPercent: parseFloat(high_roll_percent),
                lowRollPercent: parseFloat(low_roll_percent),
                evenRollPercent: parseFloat(even_roll_percent),
                oddRollPercent: parseFloat(odd_roll_percent)
            },
            rollsInfo: rolls_info.map(roll => ({
                number: roll.roll,
                count: parseInt(roll.count),
                color: roll.color,
                percent: parseFloat(roll.percent)
            })),
            colorsInfo: colors_info.map(color => ({
                color: color.color,
                count: color.count,
                percent: parseFloat(color.percent)
            })),
            timestamp: new Date().toISOString(),
            totalSamples: rolls_info.reduce((sum, roll) => sum + parseInt(roll.count), 0)
        };
    }

    /**
     * Obtém apenas informações das cores (resumido)
     * @param {number} n - Número de jogos para análise
     * @returns {Promise<Array>} Array com informações das cores
     */
    async getColorsAnalytics(n = 25) {
        try {
            const data = await this.getHistoryAnalytics(n);
            return data.colorsInfo;
        } catch (error) {
            console.error('❌ Erro ao obter análise de cores:', error.message);
            throw error;
        }
    }

    /**
     * Verifica se a API está respondendo
     * @returns {Promise<boolean>} Status da API
     */
    async checkAPIStatus() {
        try {
            await this.getHistoryAnalytics(5);
            console.log('🟢 API está funcionando normalmente');
            return true;
        } catch (error) {
            console.log('🔴 API não está respondendo:', error.message);
            return false;
        }
    }

    /**
     * Obtém estatísticas rápidas
     * @param {number} n - Número de jogos
     * @returns {Promise<Object>} Estatísticas resumidas
     */
    async getQuickStats(n = 25) {
        try {
            const data = await this.getHistoryAnalytics(n);
            
            return {
                totalGames: data.totalSamples,
                dominantColor: data.colorsInfo.reduce((prev, current) => 
                    prev.count > current.count ? prev : current
                ).color,
                evenOddRatio: {
                    even: data.summary.evenRollPercent,
                    odd: data.summary.oddRollPercent
                },
                colorDistribution: data.colorsInfo.reduce((acc, color) => {
                    acc[color.color] = color.percent;
                    return acc;
                }, {}),
                lastUpdate: data.timestamp
            };
        } catch (error) {
            console.error('❌ Erro ao obter estatísticas rápidas:', error.message);
            throw error;
        }
    }
}

// Exporta a classe e uma instância pronta para uso
module.exports = {
    BlazeRouletteAPI,
    blazeAPI: new BlazeRouletteAPI()
};

