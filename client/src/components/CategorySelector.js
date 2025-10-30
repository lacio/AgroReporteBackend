
import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Button, Portal, Modal, List, Text } from 'react-native-paper';
import { CATEGORIES } from '../constants/categories';

const CategorySelector = ({ onCategorySelected }) => {
  const [visible, setVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);

  const showModal = () => setVisible(true);
  const hideModal = () => setVisible(false);

  const handleSelect = (category) => {
    setSelectedCategory(category);
    onCategorySelected(category.id);
    hideModal();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Categoría*</Text>
      <Button
        mode="outlined"
        onPress={showModal}
        icon={selectedCategory ? selectedCategory.icon : 'chevron-down'}
        style={styles.button}
        contentStyle={styles.buttonContent}
      >
        {selectedCategory ? selectedCategory.name : 'Seleccionar categoría'}
      </Button>

      <Portal>
        <Modal visible={visible} onDismiss={hideModal} contentContainerStyle={styles.modalContainer}>
          <ScrollView>
            <List.Section title="Elige una categoría">
              {CATEGORIES.map((category) => (
                <List.Item
                  key={category.id}
                  title={category.name}
                  left={() => <List.Icon icon={category.icon} color={category.color} />}
                  onPress={() => handleSelect(category)}
                />
              ))}
            </List.Section>
          </ScrollView>
        </Modal>
      </Portal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    color: '#333',
  },
  button: {
    borderWidth: 1,
    borderColor: '#888',
    paddingVertical: 5,
  },
  buttonContent: {
    justifyContent: 'flex-start',
  },
  modalContainer: {
    backgroundColor: 'white',
    padding: 20,
    margin: 20,
    borderRadius: 8,
    maxHeight: '80%',
  },
});

export default CategorySelector;
