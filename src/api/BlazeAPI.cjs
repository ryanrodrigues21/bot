const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const URL_API = "https://blaze.bet.br";
const VERSION_API = "0.0.1-trial";

class Browser {
    constructor() {
        this.response = null;
        this.headers = null;
        this.session = axios.create();
    }

    setHeaders(headers = null) {
        this.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            "Content-Type": "application/json;charset=UTF-8",
            "Origin": "https://blaze.bet.br",
            "Referer": "https://blaze.bet.br/pt/?modal=auth&tab=login",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            "sec-ch-ua": '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"'
        };
        
        if (headers) {
            Object.assign(this.headers, headers);
        }
    }

    getHeaders() {
        return this.headers;
    }

    async sendRequest(method, url, options = {}) {
        try {
            const response = await this.session.request({
                method: method,
                url: url,
                ...options
            });
            return response;
        } catch (error) {
            throw error;
        }
    }
}

class BlazeAPI extends Browser {
    constructor(username = null, password = null) {
        super();
        this.proxies = null;
        this.accessToken = null;
        this.refreshToken = null;
        this.sessionId = null;
        this.isLogged = false;
        this.walletId = null;
        this.username = username;
        this.password = password;
        // Gerar um device_id único para cada instância
        this.deviceId = uuidv4();
        this.setHeaders();
        this.headers = this.getHeaders();
        this.userRank = null;
        this.lastAuthTime = null;
        this.authExpiry = 5 * 60 * 1000; // 5 minutos em ms
    }

    async auth() {
        console.log("Iniciando processo de autenticação...");
        
        // Gerar um novo session_id
        this.sessionId = String(Date.now());
        
        const data = {
            username: this.username,
            password: this.password
        };
        
        // Atualizar headers para autenticação
        const authHeaders = { ...this.headers };
        Object.assign(authHeaders, {
            referer: `${URL_API}/pt/?modal=auth&tab=login`,
            device_id: this.deviceId,
            session_id: this.sessionId
        });
        
        try {
            this.response = await this.sendRequest(
                "PUT",
                `${URL_API}/api/auth/password?analyticSessionID=${this.sessionId}`,
                {
                    data: data,
                    headers: authHeaders
                }
            );
            
            console.log(`Status Code: ${this.response.status}`);
            console.log(`Response: ${JSON.stringify(this.response.data)}`);
            
            const responseData = this.response.data;
            
            if (!responseData.error) {
                this.accessToken = responseData.access_token;
                this.refreshToken = responseData.refresh_token;
                // Atualizar session_id se fornecido na resposta
                if (responseData.session_id) {
                    this.sessionId = responseData.session_id;
                }
                this.isLogged = true;
                this.lastAuthTime = new Date();
                console.log("Autenticação bem-sucedida.");
            } else {
                console.log(`Erro na autenticação: ${responseData.error}`);
            }
            return responseData;
            
        } catch (error) {
            console.log(`Erro de rede durante a autenticação: ${error.message}`);
            return { error: error.message };
        }
    }

    async refreshAuth() {
        console.log("Tentando atualizar o token...");
        
        // Estrutura correta baseada no JavaScript
        const data = {
            props: {
                refreshToken: this.refreshToken
            }
        };
        
        // Headers completos como o navegador enviaria - ESSENCIAL incluir Authorization!
        const refreshHeaders = {
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            "Authorization": `Bearer ${this.accessToken}`,  // OBRIGATÓRIO!
            "Content-Type": "application/json;charset=UTF-8",
            "Origin": "https://blaze.bet.br",
            "Referer": "https://blaze.bet.br/pt/games/double",
            "Sec-Ch-Ua": '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
            "Sec-Ch-Ua-Mobile": "?0",  
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
        };
        
        try {
            this.response = await this.sendRequest(
                "POST",
                `${URL_API}/api/auth/refresh_token`,
                {
                    data: data,
                    headers: refreshHeaders
                }
            );
            
            console.log(`Refresh Status Code: ${this.response.status}`);
            console.log(`Refresh Response: ${JSON.stringify(this.response.data)}`);
            
            const responseData = this.response.data;
            
            if (!responseData.error) {
                // Atualizar tokens
                if (responseData.access_token) {
                    this.accessToken = responseData.access_token;
                }
                if (responseData.refresh_token) {
                    this.refreshToken = responseData.refresh_token;
                }
                if (responseData.session_id) {
                    this.sessionId = responseData.session_id;
                }
                
                this.isLogged = true;
                this.lastAuthTime = new Date();
                console.log("Token atualizado com sucesso.");
            } else {
                console.log("Falha ao atualizar token. Realizando autenticação completa.");
                return await this.auth();
            }
            return responseData;
            
        } catch (error) {
            console.log(`Erro de rede durante a atualização do token: ${error.message}`);
            console.log("Tentando autenticação completa...");
            return await this.auth();
        }
    }

    async checkAuth() {
        if (!this.isLogged || 
           (this.lastAuthTime && new Date() - this.lastAuthTime > this.authExpiry)) {
            console.log("Token possivelmente expirado. Realizando nova autenticação.");
            await this.auth();
        }
    }

    async reconnect() {
        console.log("Tentando reconectar...");
        return await this.auth();
    }

    async getProfile() {
        console.log("Obtendo perfil do usuário...");
        await this.checkAuth();
        
        const profileHeaders = { ...this.headers };
        profileHeaders.authorization = `Bearer ${this.accessToken}`;
        
        try {
            this.response = await this.sendRequest(
                "GET",
                `${URL_API}/api/users/me`,
                { headers: profileHeaders }
            );
            
            const profileData = this.response.data;
            
            if (!profileData.error) {
                this.isLogged = true;
                this.userRank = profileData.rank || "bronze";
                console.log("Perfil obtido com sucesso.");
            } else {
                console.log(`Erro ao obter perfil: ${profileData.error}`);
            }
            return profileData;
            
        } catch (error) {
            console.log(`Erro de rede ao obter perfil: ${error.message}`);
            return { error: error.message };
        }
    }

    async getBalance() {
        console.log("Obtendo saldo...");
        await this.checkAuth();
        
        const balanceHeaders = { ...this.headers };
        Object.assign(balanceHeaders, {
            referer: `${URL_API}/pt/games/double`,
            authorization: `Bearer ${this.accessToken}`
        });
        
        const maxRetries = 5;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                this.response = await this.sendRequest(
                    "GET",
                    `${URL_API}/api/wallets`,
                    {
                        headers: balanceHeaders,
                        timeout: 10000
                    }
                );
                
                if (this.response.status === 200) {
                    const balanceData = this.response.data;
                    if (balanceData && balanceData.length > 0) {
                        this.walletId = balanceData[0].id;
                        // Ensure balance is a number for frontend compatibility
                        balanceData.forEach(wallet => {
                            wallet.balance = parseFloat(wallet.balance) || 0;
                        });
                        console.log("Saldo obtido com sucesso.");
                        return balanceData;
                    } else {
                        throw new Error("Balance data is empty");
                    }
                } else {
                    throw new Error(`Unexpected status code: ${this.response.status}`);
                }
                
            } catch (error) {
                console.log(`Erro ao obter saldo (tentativa ${attempt + 1}): ${error.message}`);
                if (attempt === maxRetries - 1) {
                    throw error;
                }
                if (this.response && [401, 403].includes(this.response.status)) {
                    console.log("Erro de autenticação. Tentando reautenticar...");
                    await this.auth();
                    balanceHeaders.authorization = `Bearer ${this.accessToken}`;
                }
                const waitTime = (Math.pow(2, attempt) + Math.random()) * 1000;
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
        
        throw new Error("Failed to get balance after multiple attempts");
    }

    async getUserInfo() {
        console.log("Obtendo informações do usuário...");
        const resultDict = {};
        try {
            const profile = await this.getProfile();
            const balanceInfo = await this.getBalance();
            resultDict.balance = balanceInfo[0].balance;
            resultDict.username = profile.username;
            resultDict.wallet_id = balanceInfo[0].id;
            resultDict.tax_id = profile.tax_id || "";
            resultDict.rank = this.userRank;
            console.log("Informações do usuário obtidas com sucesso.");
            return resultDict;
        } catch (error) {
            console.log(`Erro ao obter informações do usuário: ${error.message}`);
            throw error;
        }
    }

    async getStatus() {
        await this.checkAuth();
        try {
            this.response = await this.getRoulettes();
            if (this.response) {
                return this.response.data.status;
            }
            return { status: "rolling" };
        } catch (error) {
            console.log(`Erro ao obter status: ${error.message}`);
            return { status: "error", message: error.message };
        }
    }

    async awaitingResult() {
        while (true) {
            try {
                await this.checkAuth();
                this.response = await this.getRoulettes();
                process.stdout.write(`\rSTATUS: ${this.response.data.status}`);
                if (this.response.data.status === "complete") {
                    return this.response.data;
                }
            } catch (error) {
                console.log(`Error while awaiting result: ${error.message}`);
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    async getLastDoubles() {
        await this.checkAuth();
        
        const doublesHeaders = { ...this.headers };
        doublesHeaders.authorization = `Bearer ${this.accessToken}`;
        
        const maxRetries = 3;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                this.response = await this.sendRequest(
                    "GET",
                    `${URL_API}/api/roulette_games/recent`,
                    {
                        headers: doublesHeaders,
                        timeout: 10000
                    }
                );
                
                if (this.response.status === 200) {
                    const result = {
                        items: this.response.data.map(i => ({
                            color: i.color === 0 ? "branco" : i.color === 1 ? "vermelho" : "preto",
                            value: i.roll,
                            created_date: new Date(i.created_at).toLocaleString('pt-BR', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit'
                            }).replace(/(\d{2})\/(\d{2})\/(\d{4}),/, '$3-$2-$1')
                        }))
                    };
                    return result;
                } else {
                    throw new Error(`Unexpected status code: ${this.response.status}`);
                }
                
            } catch (error) {
                console.log(`Erro ao obter últimos resultados (tentativa ${attempt + 1}): ${error.message}`);
                if (attempt === maxRetries - 1) {
                    console.log(`Failed to get last doubles: ${error.message}`);
                    return false;
                }
                const waitTime = (Math.pow(2, attempt) + Math.random()) * 1000;
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }

    async getRoulettes() {
        await this.checkAuth();
        
        const rouletteHeaders = { ...this.headers };
        rouletteHeaders.authorization = `Bearer ${this.accessToken}`;
        
        const maxRetries = 3;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                this.response = await this.sendRequest(
                    "GET",
                    `${URL_API}/api/roulette_games/current`,
                    {
                        headers: rouletteHeaders,
                        timeout: 10000
                    }
                );
                
                if (this.response.status === 200) {
                    return this.response;
                } else {
                    throw new Error(`Unexpected status code: ${this.response.status}`);
                }
                
            } catch (error) {
                console.log(`Erro ao obter roletas (tentativa ${attempt + 1}): ${error.message}`);
                if (attempt === maxRetries - 1) {
                    throw error;
                }
                const waitTime = (Math.pow(2, attempt) + Math.random()) * 1000;
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }

    getUserRank() {
        if (this.userRank === null) {
            this.getProfile();
        }
        return this.userRank;
    }

    async doubleBets(color, amount) {
        console.log(`Iniciando aposta: cor=${color}, valor=${amount}`);
        await this.checkAuth();
        
        let result = false;
        let message = "Erro, aposta não concluída!!!";
        
        try {
            var userInfo = await this.getUserInfo();
        } catch (error) {
            console.log(`Erro ao obter informações do usuário: ${error.message}`);
            return { result: false, object: null, message: "Falha ao obter informações do usuário" };
        }
        
        const data = {
            amount: parseFloat(amount).toFixed(2),
            currency_type: "BRL",
            color: color === "vermelho" ? 1 : color === "preto" ? 2 : 0,
            free_bet: false,
            room_id: 1,
            wallet_id: userInfo.wallet_id,
            rank: userInfo.rank,
            username: userInfo.username
        };

        const betHeaders = { ...this.headers };
        betHeaders.authorization = `Bearer ${this.accessToken}`;
        
        const maxRetries = 3;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                console.log(`Dados sendo enviados para a Blaze: ${JSON.stringify(data, null, 2)}`);
                this.response = await this.sendRequest(
                    "POST",
                    `${URL_API}/api/singleplayer-originals/originals/roulette_bets`,
                    {
                        data: data,
                        headers: betHeaders,
                        timeout: 10000
                    }
                );
                
                if (this.response.status === 200) {
                    result = true;
                    message = "Operação realizada com sucesso!!!";
                    console.log("Aposta realizada com sucesso.");
                    break;
                } else {
                    throw new Error(`Unexpected status code: ${this.response.status}`);
                }
                
            } catch (error) {
                console.log(`Erro ao fazer aposta (tentativa ${attempt + 1}): ${error.message}`);
                if (attempt === maxRetries - 1) {
                    message = `Erro ao fazer aposta: ${error.message}`;
                } else {
                    console.log("Tentando reautenticar...");
                    await this.auth();
                    userInfo = await this.getUserInfo();
                    Object.assign(data, {
                        wallet_id: userInfo.wallet_id,
                        rank: userInfo.rank,
                        username: userInfo.username
                    });
                    betHeaders.authorization = `Bearer ${this.accessToken}`;
                }
                const waitTime = (Math.pow(2, attempt) + Math.random()) * 1000;
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }

        return {
            result: result,
            object: result && this.response ? this.response.data : null,
            message: message
        };
    }
    
    async checkBetResult() {
        await this.checkAuth();
        
        const resultHeaders = { ...this.headers };
        resultHeaders.authorization = `Bearer ${this.accessToken}`;
        
        const maxRetries = 3;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                this.response = await this.sendRequest(
                    "GET",
                    `${URL_API}/api/singleplayer-originals/originals/roulette_games/roulette_bets/1?page=1`,
                    {
                        headers: resultHeaders,
                        timeout: 10000
                    }
                );
                
                if (this.response.status === 200) {
                    const data = this.response.data;
                    if (data.records && data.records.length > 0) {
                        const latestBet = data.records[0];
                        const betColor = latestBet.bet_color;
                        const winningColor = latestBet.winning_color;
                        
                        return betColor === winningColor;
                    } else {
                        return false; // No bets found, considering it as a loss
                    }
                } else {
                    throw new Error(`Unexpected status code: ${this.response.status}`);
                }
                
            } catch (error) {
                if (attempt === maxRetries - 1) {
                    console.log(`Error checking bet result: ${error.message}`);
                    return false;
                }
                const waitTime = (Math.pow(2, attempt) + Math.random()) * 1000;
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
        
        return false; // If all retries fail, consider it as a loss
    }
}

module.exports = { BlazeAPI, Browser };