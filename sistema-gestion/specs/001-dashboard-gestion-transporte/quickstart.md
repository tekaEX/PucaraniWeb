# Quickstart: validación del dashboard de gestión

## Requisitos previos

- Node.js instalado
- Supabase project configured with environment variables in `.env.local`
- Dependencies installed via `npm install`
- Local app running with `npm run dev`

## Escenarios de validación

### 1. Acceso y roles
1. Inicia sesión con un usuario admin o operador.
2. Verifica que la app carga el shell principal y el selector de periodo.
3. Confirma que roles no autorizados son redirigidos a login.

**Resultado esperado**: la sesión y la autorización funcionan como en la arquitectura actual.

### 2. Cotización y flujo básico
1. Navega a Cotizaciones.
2. Crea una nueva cotización con cliente y detalle.
3. Revisa que el número correlativo se asigne correctamente.
4. Valida la exportación de PDF/Excel para el cliente.

**Resultado esperado**: la cotización queda consistente con el flujo operativo del negocio.

### 3. Viajes y facturación
1. Acepta una cotización.
2. Genera un viaje asociado.
3. Marca el viaje como realizado.
4. Crea la factura correspondiente.
5. Registra el cobro.

**Resultado esperado**: los estados derivados se actualizan sin duplicación manual de lógica.

### 4. Vencimientos de documentación legal
1. Revisa la sección de vehículos y choferes.
2. Verifica que los documentos vencidos o por vencer aparecen en alertas.
3. Confirma el comportamiento de notificaciones y campana.

**Resultado esperado**: la gestión legal se convierte en un flujo visible y accionable.

### 5. Informe financiero mensual
1. Selecciona un periodo mensual.
2. Revisa dashboard y KPIs.
3. Verifica ingresos, egresos y utilidad por mes.
4. Comprueba que la navegación y los filtros respetan el periodo global.

**Resultado esperado**: el informe refleja la salud financiera mensual del negocio sin inconsistencias.

## Comandos de verificación

```bash
npm run lint
npm test
```

## Resultado de éxito

Si los escenarios anteriores se cumplen, el feature está listo para continuar al siguiente estado de implementación.
