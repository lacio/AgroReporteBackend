import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { TouchableRipple, Portal, Modal, List, Text, useTheme, Icon } from 'react-native-paper';
import { CATEGORIES } from '../constants/categories';

const CategorySelector = ({ onCategorySelected, selectedCategoryId }) => {
  const [visible, setVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const theme = useTheme();

  React.useEffect(() => {
    if (selectedCategoryId) {
      const found = CATEGORIES.find(c => c.id === selectedCategoryId);
      if (found) setSelectedCategory(found);
    } else if (!selectedCategoryId) {
      setSelectedCategory(null);
    }
  }, [selectedCategoryId]);

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
      <TouchableRipple
        onPress={showModal}
        style={styles.touchable}
        rippleColor="rgba(0, 0, 0, .1)"
      >
        <View style={styles.content}>
          <View style={styles.leftContent}>
            <Icon
              source={selectedCategory ? selectedCategory.icon : 'shape-outline'}
              size={24}
              color={selectedCategory ? '#2e7d32' : '#757575'}
            />
            <Text style={[styles.text, !selectedCategory && styles.placeholder]}>
              {selectedCategory ? selectedCategory.name : 'Seleccionar categoría'}
            </Text>
          </View>
          <Icon source="chevron-down" size={24} color="#757575" />
        </View>
      </TouchableRipple>

      <Portal>
        <Modal visible={visible} onDismiss={hideModal} contentContainerStyle={styles.modalContainer}>
          <ScrollView>
            <List.Section title="Elige una categoría">
              {CATEGORIES.map((category) => (
                <List.Item
                  key={category.id}
                  title={category.name}
                  description={category.description}
                  descriptionNumberOfLines={4}
                  left={props => <List.Icon {...props} icon={category.icon} color={category.color} />}
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
    borderColor: '#757575',
    backgroundColor: '#fff',
    borderRadius: 4,
  },
  buttonContent: {
    height: 50,
    justifyContent: 'flex-start',
  },
  buttonLabel: {
    fontSize: 16,
    marginLeft: 8,
  },
  touchable: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#757575',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 50,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  text: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
  },
  placeholder: {
    color: '#757575',
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
