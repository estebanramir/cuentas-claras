/**
 * Prueba de punta a punta contra la API real corriendo en localhost.
 *
 * No existe ningun endpoint de login de prueba: seria un bypass permanente en
 * una app que maneja plata. El script crea los usuarios con Prisma y firma el
 * token con la misma funcion que usa la API, asi que las rutas se ejercitan
 * exactamente como en produccion.
 *
 *   pnpm --filter @cuentas/api e2e
 */

import { prisma } from '@cuentas/db';
import { addDays, addMonths, todayInBogota } from '@cuentas/shared';
import { signAccessToken } from '../src/lib/auth';

const BASE = process.env.E2E_BASE ?? 'http://localhost:4000';
const today = todayInBogota();

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed++;
    console.log(`  ok  ${label}`);
  } else {
    failed++;
    console.error(`  FALLO  ${label}`);
    if (detail !== undefined) console.error('        ', JSON.stringify(detail, null, 2));
  }
}

function section(name: string): void {
  console.log(`\n${name}`);
}

async function api<T = any>(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<{ status: number; data: T }> {
  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await response.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

async function reset(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "NotifyLog", "ExpenseShare", "Expense", "Settlement", "BillInstance",
      "BillShare", "Bill", "Category", "Member", "Group", "Device", "RefreshToken",
      "FxRate", "User" RESTART IDENTITY CASCADE
  `);
}

async function main(): Promise<void> {
  console.log(`Probando ${BASE} — hoy en Bogota: ${today}`);
  await reset();

  section('Salud');
  const health = await api('/api/health');
  check('el servidor responde', health.status === 200 && health.data.ok === true, health.data);
  check('el servidor sabe que dia es en Bogota', health.data.today === today, health.data);

  // --- Usuarios, como si ya hubieran entrado con Google ---
  const esteban = await prisma.user.create({
    data: { googleSub: 'sub-esteban', email: 'esteban@example.com', name: 'Esteban' },
  });
  const ana = await prisma.user.create({
    data: { googleSub: 'sub-ana', email: 'ana@example.com', name: 'Ana' },
  });
  const tokenE = await signAccessToken(esteban.id);
  const tokenA = await signAccessToken(ana.id);

  section('Sesion');
  const sinToken = await api('/api/groups');
  check('sin token responde 401', sinToken.status === 401, sinToken.data);
  const tokenMalo = await api('/api/groups', { token: 'no-es-un-token' });
  check('con token invalido responde 401', tokenMalo.status === 401, tokenMalo.data);

  section('Grupo');
  const creado = await api('/api/groups', {
    method: 'POST',
    token: tokenE,
    body: { name: 'Casa', defaultCurrency: 'COP' },
  });
  check('se crea el grupo', creado.status === 201, creado.data);
  const groupId: string = creado.data.id;
  const memberE: string = creado.data.members[0].id;
  check('quien lo crea queda como dueño', creado.data.members[0].role === 'OWNER', creado.data.members);

  const cats = await api(`/api/categories?groupId=${groupId}`, { token: tokenE });
  check('el grupo nace con categorias', cats.data.length === 8, cats.data.length);

  const agregada = await api(`/api/groups/${groupId}/members`, {
    method: 'POST',
    token: tokenE,
    body: { displayName: 'Ana', email: 'ana@example.com' },
  });
  check('se agrega a Ana y queda enlazada a su cuenta', agregada.data.hasAccount === true, agregada.data);
  const memberA: string = agregada.data.id;

  const anaVe = await api('/api/me', { token: tokenA });
  check('Ana ve el grupo en su sesion', anaVe.data.groups.some((g: any) => g.groupId === groupId), anaVe.data);

  const ajeno = await api(`/api/groups/${groupId}/balances`, { token: await signAccessToken(
    (await prisma.user.create({ data: { googleSub: 'sub-x', email: 'x@example.com', name: 'X' } })).id,
  ) });
  check('alguien de afuera no puede ver el grupo', ajeno.status === 403, ajeno.data);

  section('El caso de la conversacion: 50k y 100k');
  const g1 = await api('/api/expenses', {
    method: 'POST',
    token: tokenE,
    body: {
      groupId, description: 'Mercado', amount: '50000', currency: 'COP', date: today,
      paidByMemberId: memberE, isShared: true, splitMethod: 'EQUAL',
      shares: [{ memberId: memberE }, { memberId: memberA }],
    },
  });
  check('se registra el gasto de 50.000', g1.status === 201, g1.data);

  await api('/api/expenses', {
    method: 'POST',
    token: tokenA,
    body: {
      groupId, description: 'Arriendo', amount: '100000', currency: 'COP', date: today,
      paidByMemberId: memberA, isShared: true, splitMethod: 'EQUAL',
      shares: [{ memberId: memberE }, { memberId: memberA }],
    },
  });

  const bal = await api(`/api/groups/${groupId}/balances`, { token: tokenE });
  const balE = bal.data.members.find((m: any) => m.memberId === memberE);
  const balA = bal.data.members.find((m: any) => m.memberId === memberA);
  check('Esteban queda debiendo 25.000', balE.balance === '-25000', balE);
  check('a Ana le deben 25.000', balA.balance === '25000', balA);
  check('a cada uno le tocaban 75.000', balE.owed === '75000' && balA.owed === '75000', [balE, balA]);
  check('sugiere una sola transferencia', bal.data.transfers.length === 1, bal.data.transfers);
  check(
    'la frase dice quien le debe a quien',
    bal.data.transfers[0]?.summary === 'Esteban le debe $25.000 a Ana',
    bal.data.transfers[0],
  );

  section('Saldar la deuda');
  const abono = await api('/api/settlements', {
    method: 'POST',
    token: tokenE,
    body: { groupId, fromMemberId: memberE, toMemberId: memberA, amount: '25000', currency: 'COP', date: today },
  });
  check('se registra el abono', abono.status === 201, abono.data);
  const bal2 = await api(`/api/groups/${groupId}/balances`, { token: tokenE });
  check('todos quedan en cero', bal2.data.members.every((m: any) => m.balance === '0'), bal2.data.members);
  check('ya no sugiere transferencias', bal2.data.transfers.length === 0, bal2.data.transfers);

  section('Gasto personal');
  await api('/api/expenses', {
    method: 'POST',
    token: tokenE,
    body: {
      groupId, description: 'Mis audifonos', amount: '300000', currency: 'COP', date: today,
      paidByMemberId: memberE, isShared: false, splitMethod: 'EQUAL', shares: [{ memberId: memberE }],
    },
  });
  const bal3 = await api(`/api/groups/${groupId}/balances`, { token: tokenE });
  check('un gasto personal no mueve el balance de nadie', bal3.data.members.every((m: any) => m.balance === '0'), bal3.data.members);

  const personalDeDos = await api('/api/expenses', {
    method: 'POST',
    token: tokenE,
    body: {
      groupId, description: 'Invalido', amount: '1000', currency: 'COP', date: today,
      paidByMemberId: memberE, isShared: false, splitMethod: 'EQUAL',
      shares: [{ memberId: memberE }, { memberId: memberA }],
    },
  });
  check('un gasto personal con dos participantes se rechaza', personalDeDos.status === 400, personalDeDos.data);

  section('Multi-moneda');
  await prisma.fxRate.create({
    data: { date: new Date(`${today}T00:00:00Z`), currency: 'USD', copPerUnit: '3950.00000000' },
  });
  const netflix = await api('/api/expenses', {
    method: 'POST',
    token: tokenE,
    body: {
      groupId, description: 'Netflix', amount: '1299', currency: 'USD', date: today,
      paidByMemberId: memberE, isShared: true, splitMethod: 'EQUAL',
      shares: [{ memberId: memberE }, { memberId: memberA }],
    },
  });
  check('12,99 USD a 3.950 se convierte en 51.311', netflix.data.amountBase === '51311', netflix.data);
  check('la tasa queda congelada en el gasto', netflix.data.fxRate.startsWith('3950'), netflix.data.fxRate);
  const partes = netflix.data.shares.map((s: any) => s.amountBase).sort();
  check('el peso sobrante no se pierde al partir', partes.join('+') === '25655+25656', partes);

  const manual = await api('/api/expenses', {
    method: 'POST',
    token: tokenE,
    body: {
      groupId, description: 'Compra online', amount: '1000', currency: 'USD', date: today, fxRate: '4100',
      paidByMemberId: memberE, isShared: true, splitMethod: 'EQUAL',
      shares: [{ memberId: memberE }, { memberId: memberA }],
    },
  });
  check('se puede poner la tasa a mano', manual.data.amountBase === '41000', manual.data);

  section('Repartos que no son 50/50');
  const porcentaje = await api('/api/expenses', {
    method: 'POST',
    token: tokenE,
    body: {
      groupId, description: 'Servicios', amount: '100000', currency: 'COP', date: today,
      paidByMemberId: memberE, isShared: true, splitMethod: 'PERCENT',
      shares: [{ memberId: memberE, weight: 70 }, { memberId: memberA, weight: 30 }],
    },
  });
  const porA = porcentaje.data.shares.find((s: any) => s.memberId === memberA);
  check('el reparto 70/30 funciona', porA.amountBase === '30000', porcentaje.data.shares);

  const malPorcentaje = await api('/api/expenses', {
    method: 'POST',
    token: tokenE,
    body: {
      groupId, description: 'Mal', amount: '100000', currency: 'COP', date: today,
      paidByMemberId: memberE, isShared: true, splitMethod: 'PERCENT',
      shares: [{ memberId: memberE, weight: 60 }, { memberId: memberA, weight: 30 }],
    },
  });
  check('porcentajes que no suman 100 se rechazan', malPorcentaje.status === 400, malPorcentaje.data);

  section('Persona sin cuenta');
  const invitado = await api(`/api/groups/${groupId}/members`, {
    method: 'POST', token: tokenE, body: { displayName: 'Suegra' },
  });
  check('se agrega a alguien sin cuenta', invitado.data.hasAccount === false, invitado.data);
  const memberS: string = invitado.data.id;

  const aTres = await api('/api/expenses', {
    method: 'POST',
    token: tokenE,
    body: {
      groupId, description: 'Almuerzo', amount: '100000', currency: 'COP', date: today,
      paidByMemberId: memberE, isShared: true, splitMethod: 'EQUAL',
      shares: [{ memberId: memberE }, { memberId: memberA }, { memberId: memberS }],
    },
  });
  const suma = aTres.data.shares.reduce((acc: bigint, s: any) => acc + BigInt(s.amountBase), 0n);
  check('100.000 entre tres suma exacto', suma === 100000n, aTres.data.shares);
  const bal4 = await api(`/api/groups/${groupId}/balances`, { token: tokenE });
  check('la persona sin cuenta aparece en los balances', bal4.data.members.length === 3, bal4.data.members);
  check(
    'los balances siguen sumando cero',
    bal4.data.members.reduce((acc: bigint, m: any) => acc + BigInt(m.balance), 0n) === 0n,
    bal4.data.members,
  );

  section('Editar y borrar');
  const editado = await api(`/api/expenses/${g1.data.id}`, {
    method: 'PATCH', token: tokenE, body: { amount: '60000' },
  });
  check('editar recalcula el reparto', editado.data.shares.every((s: any) => s.amountBase === '30000'), editado.data.shares);

  const borrado = await api(`/api/expenses/${g1.data.id}`, { method: 'DELETE', token: tokenE });
  check('se borra el gasto', borrado.data.deleted === true, borrado.data);
  const traido = await api(`/api/expenses/${g1.data.id}`, { token: tokenE });
  check('el gasto borrado ya no se consulta', traido.status === 404, traido.data);
  const enBase = await prisma.expense.findUnique({ where: { id: g1.data.id } });
  check('pero sigue en la base con deletedAt', enBase?.deletedAt != null, enBase?.deletedAt);

  section('Facturas');
  const venceEn2 = addDays(today, 2);
  const factura = await api('/api/bills', {
    method: 'POST',
    token: tokenE,
    body: {
      groupId, name: 'Luz', estimatedAmount: '180000', currency: 'COP',
      recurrence: 'MONTHLY', anchorDate: today, dueDayOfMonth: Number(venceEn2.slice(8, 10)),
      reminderDaysBefore: [5, 2, 0], payerMemberId: memberE, splitMethod: 'EQUAL',
      shares: [{ memberId: memberE }, { memberId: memberA }],
    },
  });
  check('se crea la factura', factura.status === 201, factura.data);

  const instancias = await api(`/api/bill-instances?groupId=${groupId}`, { token: tokenE });
  check('se materializan instancias por adelantado', instancias.data.length >= 2, instancias.data.length);
  const proxima = instancias.data.find((i: any) => i.status === 'PENDING');
  check('la proxima trae el estimado de la plantilla', proxima.expectedAmount === '180000', proxima);

  const pago = await api(`/api/bill-instances/${proxima.id}/pay`, {
    method: 'POST', token: tokenE, body: { paidAmount: '194300', date: today },
  });
  check('se marca pagada', pago.data.instance.status === 'PAID', pago.data.instance);
  check('el pago genera un gasto del grupo', pago.data.expense.amountBase === '194300', pago.data.expense);
  check('el gasto hereda el nombre de la factura', pago.data.expense.description === 'Luz', pago.data.expense);
  check('el gasto hereda el reparto', pago.data.expense.shares.length === 2, pago.data.expense.shares);
  check('el gasto queda ligado a la instancia', pago.data.expense.billInstanceId === proxima.id, pago.data.expense);

  const repetido = await api(`/api/bill-instances/${proxima.id}/pay`, {
    method: 'POST', token: tokenE, body: { paidAmount: '194300', date: today },
  });
  check('no se puede pagar dos veces', repetido.status === 409, repetido.data);

  const trasPago = await api(`/api/bill-instances?groupId=${groupId}`, { token: tokenE });
  const siguiente = trasPago.data.find((i: any) => i.status === 'PENDING');
  check('el monto real actualiza el estimado del siguiente', siguiente?.expectedAmount === '194300', siguiente);

  section('Recordatorios');
  await prisma.device.createMany({
    data: [
      { userId: esteban.id, expoPushToken: 'ExponentPushToken[e2e-esteban]' },
      { userId: ana.id, expoPushToken: 'ExponentPushToken[e2e-ana]' },
    ],
  });
  const vencida = await prisma.billInstance.create({
    data: {
      billId: factura.data.id,
      dueDate: new Date(`${addDays(today, -3)}T00:00:00Z`),
      expectedAmountMinor: 180000n,
      status: 'PENDING',
    },
  });

  const cronSinSecreto = await api('/api/cron/daily');
  check('el cron no es publico', cronSinSecreto.status === 401, cronSinSecreto.data);

  const cron = await api('/api/cron/daily', { token: process.env.CRON_SECRET });
  check('el cron corre', cron.status === 200, cron.data);
  check('avisa de algo', cron.data.remindersSent > 0, cron.data);

  const avisos = await prisma.notifyLog.findMany({ where: { billInstanceId: vencida.id } });
  check('avisa a los dos usuarios de la factura vencida', avisos.length === 2, avisos.length);
  check('el aviso dice que esta vencida', avisos[0]?.title.includes('vencida') === true, avisos[0]?.title);
  check('el cuerpo dice hace cuantos dias', avisos[0]?.body.includes('3 dias') === true, avisos[0]?.body);

  const cron2 = await api('/api/cron/daily', { token: process.env.CRON_SECRET });
  check('correrlo de nuevo el mismo dia no reenvia nada', cron2.data.remindersSent === 0, cron2.data);
  const avisos2 = await prisma.notifyLog.count({ where: { billInstanceId: vencida.id } });
  check('no se duplican los avisos', avisos2 === 2, avisos2);

  const instanciasTrasCron = await api(`/api/bill-instances?groupId=${groupId}`, { token: tokenE });
  check('el cron no duplica instancias', instanciasTrasCron.data.length === trasPago.data.length + 1, {
    antes: trasPago.data.length,
    despues: instanciasTrasCron.data.length,
  });

  section('Reporte mensual');
  const reporte = await api(`/api/reports/monthly?groupId=${groupId}&month=${today.slice(0, 7)}`, { token: tokenE });
  check('el reporte responde', reporte.status === 200, reporte.data);
  check('separa lo personal de lo compartido', reporte.data.personal.total === '300000', reporte.data.personal);
  check('trae categorias ordenadas', Array.isArray(reporte.data.categories), reporte.data.categories);
  check('el mes viene con nombre', typeof reporte.data.label === 'string' && reporte.data.label.length > 0, reporte.data.label);

  section('Varios grupos');
  // El escenario real: Esteban tiene su grupo con Ana y ademas el de sus papas.
  const grupoPapasCreado = await api('/api/groups', {
    method: 'POST',
    token: tokenE,
    body: { name: 'Casa de mis papas', defaultCurrency: 'COP' },
  });
  check('se crea un segundo grupo', grupoPapasCreado.status === 201, grupoPapasCreado.data);
  const grupoPapas: string = grupoPapasCreado.data.id;
  const memberEPapas: string = grupoPapasCreado.data.members[0].id;

  check(
    'el mismo usuario tiene un miembro distinto en cada grupo',
    memberEPapas !== memberE,
    { propio: memberE, papas: memberEPapas },
  );

  const renombrado = await api(`/api/groups/${grupoPapas}/members/${memberEPapas}`, {
    method: 'PATCH',
    token: tokenE,
    body: { displayName: 'Estebitan' },
  });
  check('puede llamarse distinto en el otro grupo', renombrado.data.displayName === 'Estebitan', renombrado.data);

  const sesionE = await api('/api/me', { token: tokenE });
  check('la sesion lista los dos grupos', sesionE.data.groups.length === 2, sesionE.data.groups);
  const nombres = sesionE.data.groups.map((g: any) => g.displayName).sort();
  check('con el nombre que le corresponde a cada uno', nombres.join('|') === 'Esteban|Estebitan', nombres);

  const mama = await api(`/api/groups/${grupoPapas}/members`, {
    method: 'POST', token: tokenE, body: { displayName: 'Mama' },
  });
  const memberMama: string = mama.data.id;

  await api('/api/expenses', {
    method: 'POST',
    token: tokenE,
    body: {
      groupId: grupoPapas, description: 'Mercado en casa de mis papas', amount: '80000',
      currency: 'COP', date: today, paidByMemberId: memberMama, isShared: true,
      splitMethod: 'EQUAL',
      shares: [{ memberId: memberEPapas }, { memberId: memberMama }],
    },
  });

  const balPapas = await api(`/api/groups/${grupoPapas}/balances`, { token: tokenE });
  const miBalancePapas = balPapas.data.members.find((m: any) => m.memberId === memberEPapas);
  check('en el grupo de los papas debe 40.000', miBalancePapas.balance === '-40000', miBalancePapas);

  const balCasa = await api(`/api/groups/${groupId}/balances`, { token: tokenE });
  const miBalanceCasa = balCasa.data.members.find((m: any) => m.memberId === memberE);
  check(
    'ese gasto no toco el balance del otro grupo',
    miBalanceCasa.balance !== miBalancePapas.balance,
    { propio: miBalanceCasa.balance, papas: miBalancePapas.balance },
  );

  const gastosPapas = await api(`/api/expenses?groupId=${grupoPapas}`, { token: tokenE });
  check('los gastos de cada grupo estan separados', gastosPapas.data.length === 1, gastosPapas.data.length);

  const anaEnPapas = await api(`/api/groups/${grupoPapas}/balances`, { token: tokenA });
  check('Ana no puede ver el grupo de los papas', anaEnPapas.status === 403, anaEnPapas.data);

  const cruzado = await api('/api/expenses', {
    method: 'POST',
    token: tokenE,
    body: {
      groupId: grupoPapas, description: 'Cruzado', amount: '1000', currency: 'COP', date: today,
      paidByMemberId: memberA, isShared: true, splitMethod: 'EQUAL',
      shares: [{ memberId: memberEPapas }],
    },
  });
  check('no se puede meter a alguien de otro grupo en un gasto', cruzado.status === 400, cruzado.data);

  section('Coherencia final');
  const finales = await api(`/api/groups/${groupId}/balances`, { token: tokenE });
  const total = finales.data.members.reduce((acc: bigint, m: any) => acc + BigInt(m.balance), 0n);
  check('los balances suman cero despues de todo el recorrido', total === 0n, finales.data.members);
  const pendiente = finales.data.transfers.reduce((acc: bigint, t: any) => acc + BigInt(t.amount), 0n);
  check('las transferencias sugeridas liquidan lo que falta', pendiente > 0n, finales.data.transfers);

  console.log(`\n${passed} bien, ${failed} mal`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error('\nla prueba reviento:', error);
  await prisma.$disconnect();
  process.exit(1);
});
