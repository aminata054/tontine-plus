import swaggerJsdoc from 'swagger-jsdoc';

export const swaggerSpec = swaggerJsdoc({
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Tontine Plus API',
            version: '1.0.0',
            description: 'API REST pour Tontine Plus',
        },
        servers: [{ url: 'http://localhost:8000/api' }],
        components: {
            securitySchemes: {
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
        security: [{ BearerAuth: [] }],
    },
    // Swagger scanne ces fichiers pour les annotations @swagger
    apis: ['./routes/*.ts'],
});