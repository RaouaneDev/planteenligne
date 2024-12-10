require('dotenv').config();
const express = require('express');
const cors = require('cors');

console.log('=== DÉMARRAGE DU SERVEUR ===');
console.log('Environnement:', process.env.NODE_ENV || 'development');

// Initialisation de Stripe avec la clé secrète de test
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
console.log('Stripe initialisé');

const app = express();
const port = process.env.PORT || 3000;

// Configuration de CORS - En production, restreindre aux domaines autorisés
const allowedOrigins = process.env.NODE_ENV === 'production'
    ? [process.env.FRONTEND_URL]  // URL du frontend en production
    : ['http://localhost:8080', 'http://127.0.0.1:8080', 'http://localhost:3000'];

app.use(cors({
    origin: function (origin, callback) {
        // Permettre les requêtes sans origine (comme les appels API directs)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'La politique CORS ne permet pas l\'accès depuis cette origine.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type']
}));

// Middleware pour parser le JSON
app.use(express.json());

// Configuration des URLs de base
const CLIENT_URL = process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : 'http://localhost:8080';

console.log('URL client configurée:', CLIENT_URL);

// Routes
app.post('/api/create-checkout-session', async (req, res) => {
    console.log('\n=== NOUVELLE REQUÊTE DE PAIEMENT ===');
    console.log('Timestamp:', new Date().toISOString());
    
    try {
        const { items } = req.body;
        console.log('Items reçus:', JSON.stringify(items, null, 2));
        
        if (!items || items.length === 0) {
            console.log('Erreur: Panier vide');
            return res.status(400).json({ error: 'Le panier est vide' });
        }

        // Validation des items
        console.log('Validation des items...');
        for (const item of items) {
            console.log('Vérification de l\'item:', item.name);
            if (!item.name || !item.price || !item.quantity) {
                console.error('Item invalide détecté:', item);
                return res.status(400).json({ 
                    error: 'Format d\'item invalide',
                    details: 'Chaque item doit avoir un nom, un prix et une quantité'
                });
            }
        }

        console.log('Création des line items pour Stripe...');
        const lineItems = items.map(item => {
            console.log(`Préparation de l'item "${item.name}" (${item.quantity}x ${item.price}€)`);
            const lineItem = {
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: item.name,
                    },
                    unit_amount: Math.round(item.price * 100),
                },
                quantity: item.quantity,
            };

            if (item.image) {
                console.log('Image trouvée pour:', item.name);
                lineItem.price_data.product_data.images = [item.image];
            }

            return lineItem;
        });
        
        console.log('Line items créés:', JSON.stringify(lineItems, null, 2));

        console.log('Création de la session Stripe...');
        const sessionConfig = {
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: `${CLIENT_URL}/success.html`,
            cancel_url: `${CLIENT_URL}/cancel.html`,
            allow_promotion_codes: true,
            billing_address_collection: 'required',
            shipping_address_collection: {
                allowed_countries: ['FR']
            }
        };
        
        console.log('Configuration de la session:', JSON.stringify(sessionConfig, null, 2));
        
        const session = await stripe.checkout.sessions.create(sessionConfig);
        console.log('Session créée avec succès. ID:', session.id);

        res.json({ id: session.id });
    } catch (error) {
        console.error('\n=== ERREUR LORS DE LA CRÉATION DE LA SESSION ===');
        console.error('Message:', error.message);
        console.error('Stack:', error.stack);
        
        res.status(500).json({ 
            error: 'Erreur lors de la création de la session de paiement',
            details: error.message
        });
    }
});

// Route de santé pour Heroku
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Démarrage du serveur
app.listen(port, '0.0.0.0', () => {
    console.log(`\n=== SERVEUR DÉMARRÉ ===`);
    console.log(`Port: ${port}`);
    console.log(`URL client: ${CLIENT_URL}`);
    console.log('Configuration complète chargée et serveur prêt à recevoir des requêtes');
});
