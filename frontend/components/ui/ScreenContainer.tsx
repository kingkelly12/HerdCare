import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ScreenContainerProps {
  children: ReactNode;
  /** Rendered outside the ScrollView, pinned to the bottom — for the primary save/submit action. */
  footer?: ReactNode;
  /** Rendered as an absolutely-positioned sibling of the scroll body, so it stays fixed while scrolling. */
  fab?: ReactNode;
  scroll?: boolean;
}

export function ScreenContainer({ children, footer, fab, scroll = true }: ScreenContainerProps) {
  const Body = scroll ? ScrollView : View;
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} className="flex-1 bg-ink-50">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Body className="flex-1" contentContainerClassName={scroll ? 'gap-4 p-4 pb-8' : undefined} style={scroll ? undefined : { flex: 1, padding: 16, gap: 16 }}>
          {children}
        </Body>
        {footer ? <View className="border-t border-ink-100 bg-white p-4">{footer}</View> : null}
        {fab}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
