import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';

import LoginScreen      from '../screens/auth/LoginScreen';
import HomeScreen       from '../screens/main/HomeScreen';
import HistoryScreen    from '../screens/main/HistoryScreen';
import ProfileScreen    from '../screens/main/ProfileScreen';
import BreakScreen      from '../screens/breaks/BreakScreen';
import LeaveRequestScreen from '../screens/leaves/LeaveRequestScreen';
import SplashScreen from '../screens/SplashScreen';

const RootStack = createStackNavigator();
const Tab       = createBottomTabNavigator();
const HomeStack = createStackNavigator();

function HomeStackNav() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain"     component={HomeScreen} />
      <HomeStack.Screen name="Break"        component={BreakScreen} />
      <HomeStack.Screen name="LeaveRequest" component={LeaveRequestScreen} />
    </HomeStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.gray400,
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopWidth: 1,
          borderTopColor: Colors.gray100,
          height: 68,
          paddingBottom: 10,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused, color }) => {
          const map: Record<string, [string, string]> = {
            Home:    ['home', 'home-outline'],
            History: ['time', 'time-outline'],
            Profile: ['person-circle', 'person-circle-outline'],
          };
          const [a, i] = map[route.name] ?? ['apps', 'apps-outline'];
          return <Ionicons name={(focused ? a : i) as any} size={24} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home"    component={HomeStackNav} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <SplashScreen />;
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated
        ? <RootStack.Screen name="Main"  component={MainTabs} />
        : <RootStack.Screen name="Login" component={LoginScreen} />
      }
    </RootStack.Navigator>
  );
}
