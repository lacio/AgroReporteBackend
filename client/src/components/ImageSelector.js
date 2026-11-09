
import React, { useState } from 'react';
import { Platform, View, Image, StyleSheet, Alert } from 'react-native';
import { Button, IconButton, Text } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

const MAX_BASE64_CHARS = 125000;
const COMPRESSION_PASSES = [
  { maxDimension: 800, quality: 0.6 },
  { maxDimension: 650, quality: 0.5 },
  { maxDimension: 500, quality: 0.4 },
  { maxDimension: 400, quality: 0.3 },
  { maxDimension: 320, quality: 0.2 },
];
const MAX_PHOTOS = 5;

const ImageSelector = ({ onImagesChanged }) => {
  const [images, setImages] = useState([]);

  const processImage = async (asset) => {
    const width = asset.width || 1920;
    const height = asset.height || 1080;
    let result = null;

    console.log(`📸 Procesando imagen original: ${width}x${height}`);

    for (let i = 0; i < COMPRESSION_PASSES.length; i++) {
      const { maxDimension, quality } = COMPRESSION_PASSES[i];
      const resizeAction = [{
        resize: width >= height
          ? { width: Math.min(width, maxDimension) }
          : { height: Math.min(height, maxDimension) },
      }];

      try {
        result = await ImageManipulator.manipulateAsync(
          asset.uri,
          resizeAction,
          {
            compress: quality,
            format: ImageManipulator.SaveFormat.JPEG,
            base64: true,
          }
        );

        if (!result || !result.base64) {
          throw new Error("No se pudo obtener la representación base64 de la imagen.");
        }

        const base64Length = result.base64.length;
        const sizeKB = (base64Length * (3 / 4)) / 1024;

        console.log(`⚖️ Pase ${i + 1}: ${sizeKB.toFixed(2)}KB (${maxDimension}px, calidad ${quality})`);

        if (base64Length <= MAX_BASE64_CHARS) {
          break;
        }
      } catch (err) {
        result = null;
        console.warn(`Pase ${i + 1} de compresión falló:`, err);
      }
    }

    if (!result?.base64 || result.base64.length > MAX_BASE64_CHARS) {
      throw new Error('La foto no pudo reducirse a un tamaño seguro para el envío.');
    }

    const cleanBase64 = result.base64.includes('base64,') ? result.base64.split('base64,')[1] : result.base64;

    return {
      uri: result.uri,
      base64: `data:image/jpeg;base64,${cleanBase64}`,
    };
  };

  const pickImage = async (useCamera) => {
    let permissionResult;
    if (useCamera) {
      permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (permissionResult.granted === false) {
        Alert.alert('Permiso requerido', 'Se necesita acceso a la cámara para tomar fotos.');
        return;
      }
    } else {
      permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permissionResult.granted === false) {
        Alert.alert('Permiso requerido', 'Se necesita acceso a la galería para seleccionar fotos.');
        return;
      }
    }

    if (images.length >= MAX_PHOTOS) {
      Alert.alert('Límite alcanzado', `No puedes agregar más de ${MAX_PHOTOS} fotos.`);
      return;
    }

    const pickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: Platform.OS !== 'web', // Desactivar edición en Web/Safari para evitar fallos de renderizado
      aspect: [4, 3],
      quality: 0.8,
      base64: false,
    };

    let result = useCamera
      ? await ImagePicker.launchCameraAsync(pickerOptions)
      : await ImagePicker.launchImageLibraryAsync(pickerOptions);

    if (!result.canceled && result.assets && result.assets.length > 0) {
      try {
        const processedImage = await processImage(result.assets[0]);
        const newImages = [...images, processedImage];
        setImages(newImages);
        onImagesChanged(newImages);
      } catch (error) {
        console.error('Error procesando imagen:', error);
        Alert.alert('Error', 'No se pudo procesar la imagen. Intenta otra vez.');
      }
    }
  };

  const removeImage = (index) => {
    const newImages = images.filter((_, i) => i !== index);
    setImages(newImages);
    onImagesChanged(newImages);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Fotos del Incidente ({images.length}/{MAX_PHOTOS})</Text>
      <View style={styles.buttonsContainer}>
        <Button icon="camera" mode="outlined" onPress={() => pickImage(true)} style={styles.button}>
          Tomar Foto
        </Button>
        <Button icon="image-multiple" mode="outlined" onPress={() => pickImage(false)} style={styles.button}>
          Galería
        </Button>
      </View>
      <View style={styles.previewContainer}>
        {images.map((img, index) => (
          <View key={index} style={styles.previewItem}>
            <Image source={{ uri: img.uri }} style={styles.previewImage} />
            <IconButton
              icon="close-circle"
              size={24}
              onPress={() => removeImage(index)}
              style={styles.deleteIcon}
            />
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  label: {
    fontSize: 16,
    marginBottom: 8,
    color: '#333',
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  button: {
    flex: 1,
    marginHorizontal: 5,
  },
  previewContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  previewItem: {
    position: 'relative',
    margin: 5,
  },
  previewImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  deleteIcon: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 12,
  },
});

export default ImageSelector;
