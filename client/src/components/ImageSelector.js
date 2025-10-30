
import React, { useState } from 'react';
import { View, Image, StyleSheet, Alert } from 'react-native';
import { Button, IconButton, Text } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';

const MAX_PHOTOS = 5;

const ImageSelector = ({ onImagesChanged }) => {
  const [images, setImages] = useState([]);

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
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5, // Comprimir imagen
      base64: true, // Incluir base64 para envío a API
    };

    let result = useCamera
      ? await ImagePicker.launchCameraAsync(pickerOptions)
      : await ImagePicker.launchImageLibraryAsync(pickerOptions);

    if (!result.canceled) {
      const newImages = [...images, result.assets[0]];
      setImages(newImages);
      onImagesChanged(newImages);
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
