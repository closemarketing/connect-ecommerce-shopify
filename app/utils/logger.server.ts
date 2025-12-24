import winston from 'winston';

const isProduction = process.env.NODE_ENV === 'production';

// Configuración de Winston
const logger = winston.createLogger({
  level: isProduction ? 'error' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'shopi-clientify-app' },
  transports: [
    // Solo mostrar en consola si NO estamos en producción
    ...(isProduction
      ? []
      : [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.printf(({ level, message, timestamp, ...metadata }) => {
                let msg = `${timestamp} [${level}]: ${message}`;
                if (Object.keys(metadata).length > 0 && metadata.service) {
                  delete metadata.service;
                  if (Object.keys(metadata).length > 0) {
                    msg += ` ${JSON.stringify(metadata)}`;
                  }
                }
                return msg;
              })
            ),
          }),
        ]),
  ],
});

// En producción, podrías añadir transporte a archivo o servicio externo
if (isProduction) {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    })
  );
}

export default logger;
