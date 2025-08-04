const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'blaze_bot_secret_key_2024';

class AuthService {
    constructor(database) {
        this.db = database;
    }

    async register(username, password, email) {
        try {
            // Verificar se usuário já existe
            const existingUser = await this.db.getUserByUsername(username);
            if (existingUser) {
                return { success: false, error: 'Usuário já existe' };
            }

            // Criar usuário
            const userId = await this.db.createUser(username, password, email);
            
            return { 
                success: true, 
                message: 'Usuário criado com sucesso. Aguarde aprovação do administrador.',
                userId 
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async login(username, password) {
        try {
            const user = await this.db.getUserByUsername(username);
            if (!user) {
                return { success: false, error: 'Usuário não encontrado' };
            }

            if (!user.is_approved && !user.is_admin) {
                return { success: false, error: 'Usuário não aprovado pelo administrador' };
            }

            const isValidPassword = await bcrypt.compare(password, user.password);
            if (!isValidPassword) {
                return { success: false, error: 'Senha incorreta' };
            }

            // Gerar JWT token
            const token = jwt.sign(
                { 
                    userId: user.id, 
                    username: user.username, 
                    isAdmin: user.is_admin 
                },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            return {
                success: true,
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    isAdmin: user.is_admin
                }
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    verifyToken(token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            return { success: true, user: decoded };
        } catch (error) {
            return { success: false, error: 'Token inválido' };
        }
    }

    // Middleware para verificar autenticação
    authenticateToken(req, res, next) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'Token de acesso requerido' });
        }

        const verification = this.verifyToken(token);
        if (!verification.success) {
            return res.status(403).json({ error: verification.error });
        }

        req.user = verification.user;
        next();
    }

    // Middleware para verificar se é admin
    requireAdmin(req, res, next) {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
        }
        next();
    }
}

module.exports = AuthService;