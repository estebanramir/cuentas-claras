import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Pide permiso y registra el token del celular en el servidor.
 * Devuelve false en vez de reventar: no poder avisar es una molestia, no una
 * razon para que la persona no pueda usar la app.
 */
export async function registrarDispositivo(): Promise<boolean> {
  if (!Device.isDevice) return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('recordatorios', {
      name: 'Recordatorios de facturas',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#1E5C4C',
    });
  }

  const actual = await Notifications.getPermissionsAsync();
  let permiso = actual.status;
  if (permiso !== 'granted') {
    permiso = (await Notifications.requestPermissionsAsync()).status;
  }
  if (permiso !== 'granted') return false;

  try {
    const token = await Notifications.getExpoPushTokenAsync();
    await api('/api/devices', {
      method: 'POST',
      body: { expoPushToken: token.data, platform: Platform.OS },
    });
    return true;
  } catch {
    return false;
  }
}
