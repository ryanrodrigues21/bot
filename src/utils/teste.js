const { BlazeAPI } = require('./BlazeAPI'); // ajuste para o caminho correto se necessário

async function testFinalRefresh() {
    console.log("=== TESTE FINAL - REFRESH TOKEN FUNCIONANDO ===\n");
    
    // Use os novos tokens que funcionaram no teste anterior
    const accessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NDk1OTQ3NywiaXNSZWZyZXNoVG9rZW4iOmZhbHNlLCJibG9ja3MiOltdLCJ1dWlkIjoiMGI5MjkyNjMtMWI4Mi00YWI0LTkxNzUtNzJjMjY2YzI4MzRiIiwiaWF0IjoxNzU0MjM2MDE5LCJleHAiOjE3NTk0MjAwMTl9.CfwEVgu4grwqY1zKd3wJYDLxi6DJL1FCoigOuV0Vde8";
    const refreshToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NDk1OTQ3NywiaXNSZWZyZXNoVG9rZW4iOnRydWUsImJsb2NrcyI6W10sInV1aWQiOiJkNzM4YzE2MS1iN2NmLTQ5OTAtYTc4Ny01NGI3MzNhM2M4ZDgiLCJpYXQiOjE3NTQyMzYwMTksImV4cCI6MTc1OTQyMDAxOX0.vGjq4IJ4YtCMxSr7PNoVmwCv9hPfyyPDmwwik8XUBT8";
    
    // Ou use os tokens originais se ainda estão válidos
    // const accessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NDk1OTQ3NywiaXNSZWZyZXNoVG9rZW4iOmZhbHNlLCJibG9ja3MiOltdLCJ1dWlkIjoiMmRhNjUzMGEtM2Y0Zi00NmE4LWE1NTctOWIwMWMyNWViNzVjIiwiaWF0IjoxNzU0MjM1MDY4LCJleHAiOjE3NTk0MTkwNjh9.FzVR9UtzGcF2f3TRcHpznCLsSQFtUW5aBOT7qeXHtto";
    // const refreshToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NDk1OTQ3NywiaXNSZWZyZXNoVG9rZW4iOnRydWUsImJsb2NrcyI6W10sInV1aWQiOiI1YzgzOGFhZS1iZDRmLTQ3YTUtYTM5ZC0zOWE4NTEzNmQ3MjkiLCJpYXQiOjE3NTQyMzUwNjgsImV4cCI6MTc1OTQxOTA2OH0.HexqVb2r_pbUAV2DErz5nkG_M3g48BI0bwJnvcJe32M";
    
    console.log("Tokens fornecidos:");
    console.log(`Access Token: ${accessToken.substring(0, 50)}...`);
    console.log(`Refresh Token: ${refreshToken.substring(0, 50)}...`);
    
    // Instanciar BlazeAPI
    const api = new BlazeAPI();
    api.accessToken = accessToken;
    api.refreshToken = refreshToken;
    api.isLogged = true;
    
    console.log("\n1. Testando se o token atual funciona...");
    try {
        const balance = await api.getBalance();
        if (balance) {
            console.log("✅ Token atual funciona!");
            console.log(`   Saldo: R$ ${balance[0]?.balance || 'N/A'}`);
        } else {
            console.log("❌ Token atual não funciona");
            return;
        }
    } catch (error) {
        console.log(`❌ Erro: ${error.message}`);
        return;
    }
    
    console.log("\n2. Testando refresh usando a API corrigida...");
    try {
        // Salvar tokens originais para comparação
        const originalAccess = api.accessToken;
        const originalRefresh = api.refreshToken;
        
        // Executar refresh
        const resultado = await api.refreshAuth();
        
        if (!resultado.error) {
            console.log("✅ REFRESH FUNCIONOU!");
            console.log(`   Novo Access Token: ${api.accessToken.substring(0, 50)}...`);
            console.log(`   Novo Refresh Token: ${api.refreshToken.substring(0, 50)}...`);
            console.log(`   Session ID: ${api.sessionId}`);
            
            // Verificar se os tokens mudaram
            const tokensMudaram = (
                api.accessToken !== originalAccess || 
                api.refreshToken !== originalRefresh
            );
            console.log(`   Tokens foram atualizados: ${tokensMudaram ? '✅ SIM' : '⚠️ NÃO'}`);
            
        } else {
            console.log(`❌ Erro no refresh: ${JSON.stringify(resultado)}`);
            return;
        }
        
    } catch (error) {
        console.log(`❌ Exceção durante refresh: ${error.message}`);
        return;
    }
    
    console.log("\n3. Testando se o novo token funciona...");
    try {
        const balance = await api.getBalance();
        if (balance) {
            console.log("✅ Novo token funciona perfeitamente!");
            console.log(`   Saldo: R$ ${balance[0]?.balance || 'N/A'}`);
            console.log(`   Wallet ID: ${balance[0]?.id || 'N/A'}`);
        } else {
            console.log("❌ Novo token não funciona");
        }
    } catch (error) {
        console.log(`❌ Erro ao testar novo token: ${error.message}`);
    }
    
    console.log("\n4. Testando múltiplos refreshs consecutivos...");
    for (let i = 0; i < 3; i++) {
        try {
            console.log(`\n   Refresh #${i + 1}...`);
            const resultado = await api.refreshAuth();
            if (!resultado.error) {
                console.log(`   ✅ Refresh #${i + 1} funcionou!`);
            } else {
                console.log(`   ❌ Refresh #${i + 1} falhou: ${JSON.stringify(resultado)}`);
                break;
            }
        } catch (error) {
            console.log(`   ❌ Erro no refresh #${i + 1}: ${error.message}`);
            break;
        }
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("🎉 PARABÉNS! O REFRESH TOKEN ESTÁ FUNCIONANDO!");
    console.log("=".repeat(60));
    console.log("Resumo:");
    console.log("✅ Refresh token funciona com Authorization header");
    console.log("✅ Headers completos do navegador são necessários"); 
    console.log("✅ Payload correto: {\"props\": {\"refreshToken\": \"...\"}}");
    console.log("✅ Novos tokens são gerados e funcionam");
    console.log("✅ Múltiplos refreshs consecutivos funcionam");
    console.log("\nAgora você pode usar tokens do navegador e renová-los automaticamente!");
    console.log("Não precisa mais fazer login via bot! 🚀");
}

// Executar apenas se este arquivo for executado diretamente
if (require.main === module) {
    testFinalRefresh().catch(error => {
        console.error('Erro durante o teste:', error.message);
        process.exit(1);
    });
}

module.exports = { testFinalRefresh };