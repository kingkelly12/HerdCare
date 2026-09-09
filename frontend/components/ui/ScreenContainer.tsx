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
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} className="flex-1 bg-canvas">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            className="flex-1"
            contentContainerClassName="gap-5 px-4 pb-10 pt-2"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View className="flex-1 gap-4 px-4 pt-2">{children}</View>
        )}
        {footer ? <View className="border-t border-line bg-surface px-4 py-3">{footer}</View> : null}
        {fab}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
