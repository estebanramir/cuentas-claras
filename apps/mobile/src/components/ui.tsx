/**
 * Las piezas de interfaz de la app.
 *
 * Todas obedecen las reglas de la seccion 11: separadores de 1px en lugar de
 * sombras, cifras con numerales tabulares alineadas a la derecha, color solo
 * cuando significa algo, y radios pequeños unicamente donde se toca.
 */

import { forwardRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { espacio, radio, tabular, tipo, usePaleta } from '../theme';

export function Pantalla({
  children,
  scroll = true,
  style,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const p = usePaleta();
  const base: ViewStyle = { flex: 1, backgroundColor: p.fondo };
  if (!scroll) return <View style={[base, style]}>{children}</View>;
  return (
    <ScrollView
      style={base}
      contentContainerStyle={[{ paddingBottom: espacio.xxl * 2 }, style]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Titulo({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const p = usePaleta();
  return <Text style={[tipo.titulo, { color: p.tinta }, style]}>{children}</Text>;
}

export function Etiqueta({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const p = usePaleta();
  return (
    <Text style={[tipo.etiqueta, { color: p.apagado, textTransform: 'uppercase' }, style]}>
      {children}
    </Text>
  );
}

export function Texto({
  children,
  tono = 'tinta',
  fuerte = false,
  menor = false,
  style,
  numberOfLines,
  onPress,
}: {
  children: React.ReactNode;
  tono?: 'tinta' | 'tinta2' | 'apagado' | 'debes' | 'teDeben' | 'alerta' | 'acento';
  fuerte?: boolean;
  menor?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  onPress?: () => void;
}) {
  const p = usePaleta();
  const base = menor ? tipo.menor : fuerte ? tipo.cuerpoFuerte : tipo.cuerpo;
  const texto = (
    <Text numberOfLines={numberOfLines} style={[base, { color: p[tono] }, style]}>
      {children}
    </Text>
  );
  if (!onPress) return texto;
  // Un texto tocable de 14px necesita area de toque propia: sin esto hay que
  // apuntarle exactamente a las letras.
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      {texto}
    </Pressable>
  );
}

/** Toda cifra de la app pasa por aca, para que las columnas nunca bailen. */
export function Cifra({
  children,
  tono = 'tinta',
  grande = false,
  style,
}: {
  children: React.ReactNode;
  tono?: 'tinta' | 'tinta2' | 'apagado' | 'debes' | 'teDeben';
  grande?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const p = usePaleta();
  return (
    <Text style={[grande ? tipo.cifraGrande : tipo.cifra, tabular, { color: p[tono] }, style]}>
      {children}
    </Text>
  );
}

export function Separador() {
  const p = usePaleta();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: p.linea }} />;
}

export function Seccion({
  titulo,
  accion,
  children,
}: {
  titulo: string;
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: espacio.xl }}>
      <View style={estilos.encabezadoSeccion}>
        <Etiqueta>{titulo}</Etiqueta>
        {accion}
      </View>
      {children}
    </View>
  );
}

/** Fila de lista, al estilo de un extracto bancario: sin tarjeta, con linea. */
export function Fila({
  titulo,
  detalle,
  derecha,
  subderecha,
  onPress,
  primera = false,
}: {
  titulo: string;
  detalle?: string;
  derecha?: React.ReactNode;
  subderecha?: string;
  onPress?: () => void;
  primera?: boolean;
}) {
  const p = usePaleta();
  const contenido = (
    <View style={[estilos.fila, { backgroundColor: p.superficie }]}>
      <View style={estilos.filaIzquierda}>
        <Text numberOfLines={1} style={[tipo.cuerpo, { color: p.tinta }]}>
          {titulo}
        </Text>
        {detalle ? (
          <Text numberOfLines={1} style={[tipo.menor, { color: p.apagado, marginTop: 2 }]}>
            {detalle}
          </Text>
        ) : null}
      </View>
      <View style={estilos.filaDerecha}>
        {derecha}
        {subderecha ? (
          <Text style={[tipo.menor, tabular, { color: p.apagado, marginTop: 2 }]}>{subderecha}</Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <View>
      {!primera ? <Separador /> : null}
      {onPress ? (
        <Pressable onPress={onPress} android_ripple={{ color: p.superficie2 }}>
          {contenido}
        </Pressable>
      ) : (
        contenido
      )}
    </View>
  );
}

export function Bloque({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = usePaleta();
  return (
    <View
      style={[
        {
          backgroundColor: p.superficie,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: p.linea,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Boton({
  children,
  onPress,
  variante = 'principal',
  cargando = false,
  deshabilitado = false,
  style,
}: {
  children: string;
  onPress?: () => void;
  variante?: 'principal' | 'secundario' | 'texto';
  cargando?: boolean;
  deshabilitado?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const p = usePaleta();
  const inactivo = deshabilitado || cargando;

  const fondo =
    variante === 'principal' ? p.acento : variante === 'secundario' ? p.superficie : 'transparent';
  const color =
    variante === 'principal' ? p.acentoTexto : variante === 'secundario' ? p.tinta : p.acento;

  return (
    <Pressable
      onPress={inactivo ? undefined : onPress}
      android_ripple={variante === 'texto' ? undefined : { color: p.superficie2 }}
      style={({ pressed }) => [
        estilos.boton,
        {
          backgroundColor: fondo,
          opacity: inactivo ? 0.45 : pressed && variante === 'texto' ? 0.6 : 1,
          borderWidth: variante === 'secundario' ? StyleSheet.hairlineWidth : 0,
          borderColor: p.lineaFuerte,
          paddingVertical: variante === 'texto' ? espacio.sm : espacio.md + 2,
        },
        style,
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={color} size="small" />
      ) : (
        <Text style={[tipo.cuerpoFuerte, { color }]}>{children}</Text>
      )}
    </Pressable>
  );
}

export const Campo = forwardRef<TextInput, TextInputProps & { etiqueta: string; ayuda?: string }>(
  function Campo({ etiqueta, ayuda, style, ...props }, ref) {
    const p = usePaleta();
    return (
      <View style={{ marginBottom: espacio.lg }}>
        <Etiqueta style={{ marginBottom: espacio.xs }}>{etiqueta}</Etiqueta>
        <TextInput
          ref={ref}
          placeholderTextColor={p.apagado}
          style={[
            estilos.campo,
            tipo.cuerpo,
            {
              color: p.tinta,
              backgroundColor: p.superficie,
              borderColor: p.linea,
            },
            style,
          ]}
          {...props}
        />
        {ayuda ? (
          <Text style={[tipo.menor, { color: p.apagado, marginTop: espacio.xs }]}>{ayuda}</Text>
        ) : null}
      </View>
    );
  },
);

/** Una frase y un boton. Nada de ilustraciones. */
export function Vacio({ mensaje, accion }: { mensaje: string; accion?: React.ReactNode }) {
  const p = usePaleta();
  return (
    <View style={estilos.vacio}>
      <Text style={[tipo.cuerpo, { color: p.apagado, textAlign: 'center' }]}>{mensaje}</Text>
      {accion ? <View style={{ marginTop: espacio.lg }}>{accion}</View> : null}
    </View>
  );
}

export function Cargando() {
  const p = usePaleta();
  return (
    <View style={estilos.centrado}>
      <ActivityIndicator color={p.apagado} />
    </View>
  );
}

export function Error({ mensaje, onReintentar }: { mensaje: string; onReintentar?: () => void }) {
  const p = usePaleta();
  return (
    <View style={estilos.vacio}>
      <Text style={[tipo.cuerpo, { color: p.debes, textAlign: 'center' }]}>{mensaje}</Text>
      {onReintentar ? (
        <Boton variante="texto" onPress={onReintentar} style={{ marginTop: espacio.sm }}>
          Reintentar
        </Boton>
      ) : null}
    </View>
  );
}

/** Selector de opciones en linea. Reemplaza a un menu desplegable en formularios cortos. */
export function Opciones<T extends string>({
  valor,
  opciones,
  onCambio,
}: {
  valor: T;
  opciones: { valor: T; texto: string }[];
  onCambio: (v: T) => void;
}) {
  const p = usePaleta();
  return (
    <View style={estilos.opciones}>
      {opciones.map((opcion) => {
        const activa = opcion.valor === valor;
        return (
          <Pressable
            key={opcion.valor}
            onPress={() => onCambio(opcion.valor)}
            android_ripple={{ color: p.superficie2 }}
            style={[
              estilos.opcion,
              {
                backgroundColor: activa ? p.acentoSuave : p.superficie,
                borderColor: activa ? p.acento : p.linea,
              },
            ]}
          >
            <Text style={[tipo.menor, { color: activa ? p.acento : p.tinta2, fontWeight: activa ? '600' : '400' }]}>
              {opcion.texto}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function BotonPresionable(props: PressableProps & { children: React.ReactNode }) {
  const p = usePaleta();
  return <Pressable android_ripple={{ color: p.superficie2 }} {...props} />;
}

const estilos = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: espacio.lg,
    paddingVertical: espacio.md + 2,
    gap: espacio.md,
  },
  filaIzquierda: { flex: 1, minWidth: 0 },
  filaDerecha: { alignItems: 'flex-end' },
  encabezadoSeccion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: espacio.lg,
    marginBottom: espacio.sm,
  },
  boton: {
    borderRadius: radio.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: espacio.lg,
    minHeight: 48,
  },
  campo: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radio.md,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.md,
    minHeight: 48,
  },
  vacio: { paddingVertical: espacio.xxl, paddingHorizontal: espacio.xl, alignItems: 'center' },
  centrado: { paddingVertical: espacio.xxl, alignItems: 'center' },
  opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm },
  opcion: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radio.md,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.sm,
  },
});
