import {TextInputProps, TouchableOpacityProps, StyleProp, TextStyle} from "react-native";

declare interface ButtonProps extends TouchableOpacityProps {
    title: string;
    bgVariant?: "primary" | "secondary" | "danger" | "outline" | "success";
    textVariant?: "primary" | "default" | "secondary" | "danger" | "success";
    IconLeft?: React.ComponentType<any>;
    IconRight?: React.ComponentType<any>;
    className?: string;
}

declare interface InputFieldProps extends TextInputProps {
    label: string;
    icon?: any;
    secureTextEntry?: boolean;
    labelStyle?: StyleProp<TextStyle>;
    containerStyle?: string;
    inputStyle?: string;
    iconStyle?: string;
    className?: string;
}

declare interface Order {
    id: string;
    delivery_time_minutes?: number;
    status?: string;
    // Add other order properties as needed
}

declare interface UserData {
    id: string;
    avg_delivery_time_minutes?: number;
    // Add other user data properties as needed
}

// AsyncStorage type declaration
declare module '@react-native-async-storage/async-storage' {
    interface AsyncStorageStatic {
        getItem(key: string): Promise<string | null>;
        setItem(key: string, value: string): Promise<void>;
        removeItem(key: string): Promise<void>;
        multiRemove(keys: string[]): Promise<void>;
        clear(): Promise<void>;
        getAllKeys(): Promise<string[]>;
        multiGet(keys: string[]): Promise<Array<[string, string | null]>>;
        multiSet(keyValuePairs: Array<[string, string]>): Promise<void>;
    }
    
    const AsyncStorage: AsyncStorageStatic;
    export default AsyncStorage;
}